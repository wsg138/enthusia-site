import {
  STAFF_SUBMISSION_EDIT_GUARD_SQL,
  staffSubmissionEditPolicy
} from "./submission-edit-policy.js";

const AUDIT_EVENT_MARKER_SQL = `EXISTS (
  SELECT 1
  FROM competition_audit_events event
  WHERE event.id = ?
    AND event.competition_id = ?
    AND event.submission_id = ?
)`;

const ATTACH_AUDIT_SQL = `
  INSERT INTO competition_audit_events (
    id, competition_id, submission_id, actor_subject, actor_uuid,
    action, after_json, note, created_at
  )
  SELECT ?, submissions.competition_id, submissions.id, ?, ?,
         'SUBMISSION_IMAGE_ADDED_BY_STAFF', ?, ?, ?
  FROM submissions
  WHERE id = ?
    AND competition_id = ?
    AND revision = ?
    AND owner_subject LIKE 'staff-manual:%'
    AND removed_at IS NULL
    AND status IN ('PENDING_REVIEW','NEEDS_CHANGES')
    AND ${STAFF_SUBMISSION_EDIT_GUARD_SQL}
`;

const ATTACH_SUBMISSION_SQL = `
  UPDATE submissions
  SET revision = ?,
      staff_edited = 1,
      updated_at = ?,
      cover_image_id = COALESCE(cover_image_id, ?)
  WHERE id = ?
    AND competition_id = ?
    AND revision = ?
    AND ${AUDIT_EVENT_MARKER_SQL}
`;

const INSERT_IMAGE_SQL = `
  INSERT INTO submission_images (
    id, submission_id, sort_order, storage_key, sha256, mime_type,
    byte_size, width, height, moderation_state, created_at
  )
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PASSED', ?
  WHERE ${AUDIT_EVENT_MARKER_SQL}
`;

const INSERT_MODERATION_SQL = `
  INSERT INTO moderation_checks (
    id, competition_id, submission_id, target_type, target_id,
    provider, model, outcome, categories_json, scores_json,
    content_hash, checked_at
  )
  SELECT ?, ?, ?, 'IMAGE', ?, ?, ?, 'PASSED', ?, ?, ?, ?
  WHERE ${AUDIT_EVENT_MARKER_SQL}
`;

const REMOVE_AUDIT_SQL = `
  INSERT INTO competition_audit_events (
    id, competition_id, submission_id, actor_subject, actor_uuid,
    action, after_json, note, created_at
  )
  SELECT ?, submissions.competition_id, submissions.id, ?, ?,
         'SUBMISSION_IMAGE_REMOVED_BY_STAFF', ?, ?, ?
  FROM submissions
  WHERE id = ?
    AND competition_id = ?
    AND revision = ?
    AND removed_at IS NULL
    AND ${STAFF_SUBMISSION_EDIT_GUARD_SQL}
    AND EXISTS (
      SELECT 1
      FROM submission_images image
      WHERE image.submission_id = submissions.id
        AND image.id = ?
        AND image.removed_at IS NULL
    )
`;

const REMOVE_SUBMISSION_SQL = `
  UPDATE submissions
  SET revision = ?, staff_edited = 1, updated_at = ?
  WHERE id = ?
    AND competition_id = ?
    AND revision = ?
    AND ${AUDIT_EVENT_MARKER_SQL}
`;

const REMOVE_IMAGE_SQL = `
  UPDATE submission_images
  SET removed_at = ?, removed_by_uuid = ?
  WHERE submission_id = ?
    AND id = ?
    AND removed_at IS NULL
    AND ${AUDIT_EVENT_MARKER_SQL}
`;

const UPDATE_COVER_SQL = `
  UPDATE submissions
  SET cover_image_id = CASE
    WHEN cover_image_id = ? THEN (
      SELECT id
      FROM submission_images
      WHERE submission_id = ? AND removed_at IS NULL
      ORDER BY sort_order ASC, id ASC
      LIMIT 1
    )
    ELSE cover_image_id
  END
  WHERE id = ?
    AND competition_id = ?
    AND revision = ?
    AND ${AUDIT_EVENT_MARKER_SQL}
`;

function requireDatabase(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("Competition database binding is unavailable");
  }
  return db;
}

function requireWritableDatabase(db) {
  const database = requireDatabase(db);
  if (typeof database.batch !== "function") {
    throw new TypeError("Competition database binding is not writable");
  }
  return database;
}

function requireSortOrder(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError("Submission image sort order is invalid");
  }
  return value;
}

function serializedRecord(value) {
  return JSON.stringify(value ?? {});
}

function allStatementsChanged(results, indexes) {
  return indexes.every((index) => Number(results?.[index]?.meta?.changes ?? 0) === 1);
}

function markerBindings(operation) {
  return [operation.auditEventId, operation.competitionId, operation.submissionId];
}

export async function getStaffSubmissionImage(db, competitionId, submissionId, imageId) {
  const database = requireDatabase(db);
  return database.prepare(`
    SELECT
      i.id,
      i.submission_id AS submissionId,
      i.sort_order AS sortOrder,
      i.storage_key AS storageKey,
      i.mime_type AS mimeType,
      i.byte_size AS byteSize,
      i.width,
      i.height,
      i.moderation_state AS moderationState,
      i.created_at AS createdAt,
      i.removed_at AS removedAt,
      s.cover_image_id AS coverImageId,
      s.revision
    FROM submission_images i
    JOIN submissions s ON s.id = i.submission_id
    WHERE s.competition_id = ?
      AND s.id = ?
      AND i.id = ?
    LIMIT 1
  `).bind(competitionId, submissionId, imageId).first();
}

function attachAuditStatement(database, image, policy, nextRevision) {
  return database.prepare(ATTACH_AUDIT_SQL).bind(
    image.auditEventId,
    image.actorSubject,
    image.actorUuid,
    JSON.stringify({ imageId: image.id, sortOrder: image.sortOrder, revision: nextRevision, staffEdited: true }),
    image.privateNote ?? "Image added to staff-managed submission",
    image.createdAt,
    image.submissionId,
    image.competitionId,
    image.expectedRevision,
    policy.configVersion
  );
}

function attachSubmissionStatement(database, image, nextRevision) {
  return database.prepare(ATTACH_SUBMISSION_SQL).bind(
    nextRevision,
    image.createdAt,
    image.id,
    image.submissionId,
    image.competitionId,
    image.expectedRevision,
    ...markerBindings(image)
  );
}

function insertImageStatement(database, image) {
  return database.prepare(INSERT_IMAGE_SQL).bind(
    image.id,
    image.submissionId,
    image.sortOrder,
    image.storageKey,
    image.sha256,
    image.mimeType,
    image.byteSize,
    image.width,
    image.height,
    image.createdAt,
    ...markerBindings(image)
  );
}

function insertModerationStatement(database, image) {
  return database.prepare(INSERT_MODERATION_SQL).bind(
    image.moderationCheckId,
    image.competitionId,
    image.submissionId,
    image.id,
    image.moderation.provider,
    image.moderation.model,
    serializedRecord(image.moderation.categories),
    serializedRecord(image.moderation.scores),
    image.sha256,
    image.createdAt,
    ...markerBindings(image)
  );
}

export async function attachStaffSubmissionImage(db, image) {
  const database = requireWritableDatabase(db);
  requireSortOrder(image.sortOrder);
  const policy = staffSubmissionEditPolicy(image.expectedConfigVersion);
  const nextRevision = image.expectedRevision + 1;
  const results = await database.batch([
    attachAuditStatement(database, image, policy, nextRevision),
    attachSubmissionStatement(database, image, nextRevision),
    insertImageStatement(database, image),
    insertModerationStatement(database, image)
  ]);
  return allStatementsChanged(results, [0, 1, 2, 3])
    ? { status: "UPDATED", revision: nextRevision }
    : { status: "CONFLICT" };
}

function removalAuditStatement(database, removal, policy, nextRevision) {
  return database.prepare(REMOVE_AUDIT_SQL).bind(
    removal.auditEventId,
    removal.actorSubject,
    removal.removedByUuid,
    JSON.stringify({ imageId: removal.imageId, revision: nextRevision, staffEdited: true }),
    removal.privateNote,
    removal.removedAt,
    removal.submissionId,
    removal.competitionId,
    removal.expectedRevision,
    policy.configVersion,
    removal.imageId
  );
}

function removalSubmissionStatement(database, removal, nextRevision) {
  return database.prepare(REMOVE_SUBMISSION_SQL).bind(
    nextRevision,
    removal.removedAt,
    removal.submissionId,
    removal.competitionId,
    removal.expectedRevision,
    ...markerBindings(removal)
  );
}

function removeImageStatement(database, removal) {
  return database.prepare(REMOVE_IMAGE_SQL).bind(
    removal.removedAt,
    removal.removedByUuid,
    removal.submissionId,
    removal.imageId,
    ...markerBindings(removal)
  );
}

function updateCoverStatement(database, removal, nextRevision) {
  return database.prepare(UPDATE_COVER_SQL).bind(
    removal.imageId,
    removal.submissionId,
    removal.submissionId,
    removal.competitionId,
    nextRevision,
    ...markerBindings(removal)
  );
}

export async function removeStaffSubmissionImage(db, removal) {
  const database = requireWritableDatabase(db);
  const policy = staffSubmissionEditPolicy(removal.expectedConfigVersion);
  const nextRevision = removal.expectedRevision + 1;
  const results = await database.batch([
    removalAuditStatement(database, removal, policy, nextRevision),
    removalSubmissionStatement(database, removal, nextRevision),
    removeImageStatement(database, removal),
    updateCoverStatement(database, removal, nextRevision)
  ]);
  return allStatementsChanged(results, [0, 1, 2, 3])
    ? { status: "UPDATED", revision: nextRevision }
    : { status: "CONFLICT" };
}
