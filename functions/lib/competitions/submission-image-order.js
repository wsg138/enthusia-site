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

function revisionMarker() {
  return `EXISTS (
    SELECT 1
    FROM submissions s
    WHERE s.id = ?
      AND s.competition_id = ?
      AND s.owner_subject = ?
      AND s.revision = ?
      AND s.updated_at = ?
      AND s.status IN ('DRAFT','NEEDS_CHANGES')
      AND s.removed_at IS NULL
  )`;
}

export async function reorderOwnedSubmissionImages(db, reorder) {
  const database = requireWritableDatabase(db);
  const ids = reorder.imageIds.map((value) => String(value));
  if (!ids.length || new Set(ids).size !== ids.length) throw new TypeError("Image order is invalid");
  if (!ids.includes(reorder.coverImageId)) throw new TypeError("Cover image must be in the image order");
  const policy = ownerSubmissionEditPolicy({
    expectedConfigVersion: reorder.expectedConfigVersion,
    operationAt: reorder.updatedAt,
    reviewCloseAt: reorder.reviewCloseAt
  });

  const nextRevision = reorder.expectedRevision + 1;
  const marker = revisionMarker();
  const statements = [
    database.prepare(`
      UPDATE submissions
      SET revision = ?, updated_at = ?, cover_image_id = ?
      WHERE id = ?
        AND competition_id = ?
        AND owner_subject = ?
        AND revision = ?
        AND status IN ('DRAFT','NEEDS_CHANGES')
        AND removed_at IS NULL
        AND ${OWNER_SUBMISSION_EDIT_GUARD_SQL}
        AND (
          SELECT COUNT(*)
          FROM submission_images i
          WHERE i.submission_id = submissions.id
            AND i.removed_at IS NULL
        ) = ?
    `).bind(
      nextRevision,
      policy.operationAt,
      reorder.coverImageId,
      reorder.submissionId,
      reorder.competitionId,
      reorder.ownerSubject,
      reorder.expectedRevision,
      policy.configVersion,
      policy.reviewCloseAt,
      policy.operationAt,
      policy.reviewCloseAt,
      ids.length
    ),
    database.prepare(`
      UPDATE submission_images
      SET sort_order = sort_order + 1000
      WHERE submission_id = ?
        AND removed_at IS NULL
        AND ${marker}
    `).bind(
      reorder.submissionId,
      reorder.submissionId,
      reorder.competitionId,
      reorder.ownerSubject,
      nextRevision,
      policy.operationAt
    )
  ];

  ids.forEach((imageId, index) => {
    statements.push(database.prepare(`
      UPDATE submission_images
      SET sort_order = ?
      WHERE submission_id = ?
        AND id = ?
        AND removed_at IS NULL
        AND ${marker}
    `).bind(
      index,
      reorder.submissionId,
      imageId,
      reorder.submissionId,
      reorder.competitionId,
      reorder.ownerSubject,
      nextRevision,
      policy.operationAt
    ));
  });

  // This statement is the transaction sentinel. competition_id is NOT NULL.
  // If even one requested image failed to move out of the temporary +1000
  // range, the CASE produces NULL, SQLite aborts, and D1 rolls back the whole
  // batch instead of committing a partially reordered gallery.
  statements.push(database.prepare(`
    INSERT INTO competition_audit_events (
      id, competition_id, submission_id, actor_subject, actor_uuid,
      action, after_json, note, created_at
    )
    SELECT
      ?,
      CASE WHEN EXISTS (
        SELECT 1 FROM submission_images
        WHERE submission_id = ?
          AND removed_at IS NULL
          AND sort_order >= 1000
      ) THEN NULL ELSE ? END,
      ?, ?, ?, 'SUBMISSION_IMAGES_REORDERED', ?, ?, ?
    WHERE ${marker}
  `).bind(
    reorder.auditEventId,
    reorder.submissionId,
    reorder.competitionId,
    reorder.submissionId,
    reorder.ownerSubject,
    reorder.actorUuid,
    JSON.stringify({ imageIds: ids, coverImageId: reorder.coverImageId, revision: nextRevision }),
    "Submission images reordered",
    policy.operationAt,
    reorder.submissionId,
    reorder.competitionId,
    reorder.ownerSubject,
    nextRevision,
    policy.operationAt
  ));

  const results = await database.batch(statements);
  if (Number(results?.[0]?.meta?.changes ?? 0) !== 1) return { status: "CONFLICT" };
  const allUpdated = ids.every((_, index) => Number(results?.[2 + index]?.meta?.changes ?? 0) === 1);
  if (!allUpdated) throw new Error("Submission image reorder transaction did not update the complete image set");
  return { status: "UPDATED", revision: nextRevision };
}
