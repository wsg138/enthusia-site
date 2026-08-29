import {
  OWNER_SUBMISSION_EDIT_GUARD_SQL,
  ownerSubmissionEditPolicy
} from "./submission-edit-policy.js";

function requireWritableDatabase(db) {
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new TypeError("Competition database binding is not writable");
  }
  return db;
}

export async function updateOwnedSubmissionDraft(db, update) {
  const database = requireWritableDatabase(db);
  const policy = ownerSubmissionEditPolicy({
    expectedConfigVersion: update.expectedConfigVersion,
    operationAt: update.updatedAt,
    reviewCloseAt: update.reviewCloseAt
  });
  const nextRevision = update.expectedRevision + 1;
  const revisionPredicate = `
    EXISTS (
      SELECT 1
      FROM submissions s
      WHERE s.id = ?
        AND s.competition_id = ?
        AND s.owner_subject = ?
        AND s.revision = ?
        AND s.updated_at = ?
        AND s.status IN ('DRAFT','NEEDS_CHANGES')
        AND s.removed_at IS NULL
    )
  `;

  const statements = [
    database.prepare(`
      UPDATE submissions
      SET title = ?,
          description = ?,
          revision = ?,
          updated_at = ?
      WHERE id = ?
        AND competition_id = ?
        AND owner_subject = ?
        AND revision = ?
        AND status IN ('DRAFT','NEEDS_CHANGES')
        AND removed_at IS NULL
        AND ${OWNER_SUBMISSION_EDIT_GUARD_SQL}
    `).bind(
      update.title,
      update.description,
      nextRevision,
      policy.operationAt,
      update.submissionId,
      update.competitionId,
      update.ownerSubject,
      update.expectedRevision,
      policy.configVersion,
      policy.reviewCloseAt,
      policy.operationAt,
      policy.reviewCloseAt
    )
  ];

  if (update.location) {
    statements.push(database.prepare(`
      INSERT INTO submission_private_locations (
        submission_id, world_name, block_x, block_y, block_z,
        exact_coordinates_confirmed, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE ${revisionPredicate}
      ON CONFLICT(submission_id) DO UPDATE SET
        world_name = excluded.world_name,
        block_x = excluded.block_x,
        block_y = excluded.block_y,
        block_z = excluded.block_z,
        exact_coordinates_confirmed = excluded.exact_coordinates_confirmed,
        updated_at = excluded.updated_at
    `).bind(
      update.submissionId,
      update.location.worldName,
      update.location.x,
      update.location.y,
      update.location.z,
      update.location.exactCoordinatesConfirmed ? 1 : 0,
      policy.operationAt,
      update.submissionId,
      update.competitionId,
      update.ownerSubject,
      nextRevision,
      policy.operationAt
    ));
  } else if (update.clearLocation) {
    statements.push(database.prepare(`
      DELETE FROM submission_private_locations
      WHERE submission_id = ?
        AND ${revisionPredicate}
    `).bind(
      update.submissionId,
      update.submissionId,
      update.competitionId,
      update.ownerSubject,
      nextRevision,
      policy.operationAt
    ));
  }

  statements.push(database.prepare(`
    INSERT INTO competition_audit_events (
      id, competition_id, submission_id, actor_subject, actor_uuid,
      action, after_json, note, created_at
    )
    SELECT ?, ?, ?, ?, ?, 'SUBMISSION_UPDATED', ?, ?, ?
    WHERE ${revisionPredicate}
  `).bind(
    update.auditEventId,
    update.competitionId,
    update.submissionId,
    update.ownerSubject,
    update.actorUuid,
    JSON.stringify({ revision: nextRevision }),
    update.note ?? "Submission updated",
    policy.operationAt,
    update.submissionId,
    update.competitionId,
    update.ownerSubject,
    nextRevision,
    policy.operationAt
  ));

  const results = await database.batch(statements);
  return Number(results?.[0]?.meta?.changes ?? 0) === 1
    ? { status: "UPDATED", revision: nextRevision }
    : { status: "CONFLICT" };
}
