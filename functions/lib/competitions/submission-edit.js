import {
  OWNER_SUBMISSION_EDIT_GUARD_SQL,
  ownerSubmissionEditPolicy
} from "./submission-edit-policy.js";

const AUDIT_EVENT_MARKER_SQL = `EXISTS (
  SELECT 1
  FROM competition_audit_events event
  WHERE event.id = ?
    AND event.competition_id = ?
    AND event.submission_id = ?
)`;

const UPDATE_AUDIT_SQL = `
  INSERT INTO competition_audit_events (
    id, competition_id, submission_id, actor_subject, actor_uuid,
    action, after_json, note, created_at
  )
  SELECT ?, submissions.competition_id, submissions.id, submissions.owner_subject, ?,
         'SUBMISSION_UPDATED', ?, ?, ?
  FROM submissions
  WHERE id = ?
    AND competition_id = ?
    AND owner_subject = ?
    AND revision = ?
    AND status IN ('DRAFT','NEEDS_CHANGES')
    AND removed_at IS NULL
    AND ${OWNER_SUBMISSION_EDIT_GUARD_SQL}
`;

const UPDATE_SUBMISSION_SQL = `
  UPDATE submissions
  SET title = ?,
      description = ?,
      revision = ?,
      updated_at = ?
  WHERE id = ?
    AND competition_id = ?
    AND owner_subject = ?
    AND revision = ?
    AND ${AUDIT_EVENT_MARKER_SQL}
`;

const UPSERT_LOCATION_SQL = `
  INSERT INTO submission_private_locations (
    submission_id, world_name, block_x, block_y, block_z,
    exact_coordinates_confirmed, updated_at
  )
  SELECT ?, ?, ?, ?, ?, ?, ?
  WHERE ${AUDIT_EVENT_MARKER_SQL}
  ON CONFLICT(submission_id) DO UPDATE SET
    world_name = excluded.world_name,
    block_x = excluded.block_x,
    block_y = excluded.block_y,
    block_z = excluded.block_z,
    exact_coordinates_confirmed = excluded.exact_coordinates_confirmed,
    updated_at = excluded.updated_at
`;

const DELETE_LOCATION_SQL = `
  DELETE FROM submission_private_locations
  WHERE submission_id = ?
    AND ${AUDIT_EVENT_MARKER_SQL}
`;

function requireWritableDatabase(db) {
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new TypeError("Competition database binding is not writable");
  }
  return db;
}

function markerBindings(update) {
  return [update.auditEventId, update.competitionId, update.submissionId];
}

function auditStatement(database, update, policy, nextRevision) {
  return database.prepare(UPDATE_AUDIT_SQL).bind(
    update.auditEventId,
    update.actorUuid,
    JSON.stringify({ revision: nextRevision }),
    update.note ?? "Submission updated",
    policy.operationAt,
    update.submissionId,
    update.competitionId,
    update.ownerSubject,
    update.expectedRevision,
    policy.configVersion,
    policy.reviewCloseAt,
    policy.operationAt,
    policy.reviewCloseAt
  );
}

function submissionStatement(database, update, policy, nextRevision) {
  return database.prepare(UPDATE_SUBMISSION_SQL).bind(
    update.title,
    update.description,
    nextRevision,
    policy.operationAt,
    update.submissionId,
    update.competitionId,
    update.ownerSubject,
    update.expectedRevision,
    ...markerBindings(update)
  );
}

function upsertLocationStatement(database, update, policy) {
  return database.prepare(UPSERT_LOCATION_SQL).bind(
    update.submissionId,
    update.location.worldName,
    update.location.x,
    update.location.y,
    update.location.z,
    update.location.exactCoordinatesConfirmed ? 1 : 0,
    policy.operationAt,
    ...markerBindings(update)
  );
}

function deleteLocationStatement(database, update) {
  return database.prepare(DELETE_LOCATION_SQL).bind(
    update.submissionId,
    ...markerBindings(update)
  );
}

function locationStatement(database, update, policy) {
  if (update.location) return upsertLocationStatement(database, update, policy);
  if (update.clearLocation) return deleteLocationStatement(database, update);
  return null;
}

function statementChanged(results, index) {
  return Number(results?.[index]?.meta?.changes ?? 0) === 1;
}

export async function updateOwnedSubmissionDraft(db, update) {
  const database = requireWritableDatabase(db);
  const policy = ownerSubmissionEditPolicy({
    expectedConfigVersion: update.expectedConfigVersion,
    operationAt: update.updatedAt,
    reviewCloseAt: update.reviewCloseAt
  });
  const nextRevision = update.expectedRevision + 1;
  const statements = [
    auditStatement(database, update, policy, nextRevision),
    submissionStatement(database, update, policy, nextRevision)
  ];
  const location = locationStatement(database, update, policy);
  if (location) statements.push(location);

  const results = await database.batch(statements);
  return statementChanged(results, 0) && statementChanged(results, 1)
    ? { status: "UPDATED", revision: nextRevision }
    : { status: "CONFLICT" };
}
