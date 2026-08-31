import {
  OWNER_SUBMISSION_EDIT_GUARD_SQL,
  ownerSubmissionEditPolicy
} from "./submission-edit-policy.js";

const OPERATION_MARKER_SQL = `EXISTS (
  SELECT 1
  FROM competition_audit_events event
  WHERE event.id = ?
    AND event.competition_id = ?
    AND event.submission_id = ?
)`;

const REORDER_AUDIT_SQL = `
  INSERT INTO competition_audit_events (
    id, competition_id, submission_id, actor_subject, actor_uuid,
    action, after_json, note, created_at
  )
  SELECT ?, submissions.competition_id, submissions.id, submissions.owner_subject, ?,
         'SUBMISSION_IMAGES_REORDERED', ?, 'Submission images reordered', ?
  FROM submissions
  WHERE id = ?
    AND competition_id = ?
    AND owner_subject = ?
    AND revision = ?
    AND status IN ('DRAFT','NEEDS_CHANGES')
    AND removed_at IS NULL
    AND ${OWNER_SUBMISSION_EDIT_GUARD_SQL}
    AND (
      SELECT COUNT(*)
      FROM submission_images image
      WHERE image.submission_id = submissions.id
        AND image.removed_at IS NULL
    ) = ?
`;

const UPDATE_SUBMISSION_SQL = `
  UPDATE submissions
  SET revision = ?, updated_at = ?, cover_image_id = ?
  WHERE id = ?
    AND competition_id = ?
    AND owner_subject = ?
    AND revision = ?
    AND ${OPERATION_MARKER_SQL}
`;

const SHIFT_IMAGES_SQL = `
  UPDATE submission_images
  SET sort_order = sort_order + ?
  WHERE submission_id = ?
    AND removed_at IS NULL
    AND ${OPERATION_MARKER_SQL}
`;

const ORDER_IMAGE_SQL = `
  UPDATE submission_images
  SET sort_order = ?
  WHERE submission_id = ?
    AND id = ?
    AND removed_at IS NULL
    AND ${OPERATION_MARKER_SQL}
`;

// competition_id is NOT NULL. A leftover temporary position makes this
// statement fail, causing D1 to roll back the complete batch.
const VALIDATE_ORDER_SQL = `
  UPDATE competition_audit_events
  SET competition_id = CASE WHEN EXISTS (
    SELECT 1
    FROM submission_images image
    WHERE image.submission_id = ?
      AND image.removed_at IS NULL
      AND image.sort_order >= ?
  ) THEN NULL ELSE competition_id END
  WHERE id = ?
    AND competition_id = ?
    AND submission_id = ?
`;

function requireWritableDatabase(db) {
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new TypeError("Competition database binding is not writable");
  }
  return db;
}

function normalizedImageIds(reorder) {
  const ids = reorder.imageIds.map((value) => String(value));
  if (!ids.length || new Set(ids).size !== ids.length) {
    throw new TypeError("Image order is invalid");
  }
  if (!ids.includes(reorder.coverImageId)) {
    throw new TypeError("Cover image must be in the image order");
  }
  return ids;
}

function statementChanges(results, index) {
  return Number(results?.[index]?.meta?.changes ?? 0);
}

function resultRows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function validatedStoredPosition(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Stored submission image sort order is invalid");
  }
  return value;
}

async function storedReorderLayout(database, submissionId) {
  const result = await database.prepare(`
    SELECT
      image.sort_order AS sortOrder,
      (
        SELECT MAX(stored.sort_order)
        FROM submission_images stored
        WHERE stored.submission_id = image.submission_id
      ) AS maxSortOrder
    FROM submission_images image
    WHERE image.submission_id = ?
      AND image.removed_at IS NULL
    ORDER BY image.sort_order ASC
  `).bind(submissionId).all();
  const rows = resultRows(result);
  const positions = rows.map((row) => validatedStoredPosition(row.sortOrder));
  const maxSortOrder = rows.length
    ? validatedStoredPosition(rows[0].maxSortOrder)
    : 0;
  const temporaryOffset = maxSortOrder + 1;
  if (!Number.isSafeInteger(maxSortOrder + temporaryOffset)) {
    throw new TypeError("Stored submission image sort order is too large to reorder");
  }
  return { positions, temporaryOffset };
}

function completeImageUpdates(results, imageCount) {
  return Array.from({ length: imageCount }, (_, index) => (
    statementChanges(results, 3 + index) === 1
  )).every(Boolean);
}

function operationMarkerBindings(reorder) {
  return [reorder.auditEventId, reorder.competitionId, reorder.submissionId];
}

function reorderAuditStatement(database, reorder, policy, ids, nextRevision) {
  return database.prepare(REORDER_AUDIT_SQL).bind(
    reorder.auditEventId,
    reorder.actorUuid,
    JSON.stringify({ imageIds: ids, coverImageId: reorder.coverImageId, revision: nextRevision }),
    policy.operationAt,
    reorder.submissionId,
    reorder.competitionId,
    reorder.ownerSubject,
    reorder.expectedRevision,
    policy.configVersion,
    policy.reviewCloseAt,
    policy.operationAt,
    policy.reviewCloseAt,
    ids.length
  );
}

function updateSubmissionStatement(database, reorder, policy, nextRevision) {
  return database.prepare(UPDATE_SUBMISSION_SQL).bind(
    nextRevision,
    policy.operationAt,
    reorder.coverImageId,
    reorder.submissionId,
    reorder.competitionId,
    reorder.ownerSubject,
    reorder.expectedRevision,
    ...operationMarkerBindings(reorder)
  );
}

function shiftImagesStatement(database, reorder, temporaryOffset) {
  return database.prepare(SHIFT_IMAGES_SQL).bind(
    temporaryOffset,
    reorder.submissionId,
    ...operationMarkerBindings(reorder)
  );
}

function orderImageStatement(database, reorder, imageId, sortOrder) {
  return database.prepare(ORDER_IMAGE_SQL).bind(
    sortOrder,
    reorder.submissionId,
    imageId,
    ...operationMarkerBindings(reorder)
  );
}

function validateOrderStatement(database, reorder, temporaryOffset) {
  return database.prepare(VALIDATE_ORDER_SQL).bind(
    reorder.submissionId,
    temporaryOffset,
    reorder.auditEventId,
    reorder.competitionId,
    reorder.submissionId
  );
}

export async function reorderOwnedSubmissionImages(db, reorder) {
  const database = requireWritableDatabase(db);
  const ids = normalizedImageIds(reorder);
  const policy = ownerSubmissionEditPolicy({
    expectedConfigVersion: reorder.expectedConfigVersion,
    operationAt: reorder.updatedAt,
    reviewCloseAt: reorder.reviewCloseAt
  });
  const layout = await storedReorderLayout(database, reorder.submissionId);
  if (layout.positions.length !== ids.length) return { status: "CONFLICT" };

  const nextRevision = reorder.expectedRevision + 1;
  const imageStatements = ids.map((imageId, index) => (
    orderImageStatement(database, reorder, imageId, layout.positions[index])
  ));
  const statements = [
    reorderAuditStatement(database, reorder, policy, ids, nextRevision),
    updateSubmissionStatement(database, reorder, policy, nextRevision),
    shiftImagesStatement(database, reorder, layout.temporaryOffset),
    ...imageStatements,
    validateOrderStatement(database, reorder, layout.temporaryOffset)
  ];

  const results = await database.batch(statements);
  if (statementChanges(results, 0) !== 1) return { status: "CONFLICT" };
  if (!completeImageUpdates(results, ids.length)) {
    throw new Error("Submission image reorder transaction did not update the complete image set");
  }
  return { status: "UPDATED", revision: nextRevision };
}
