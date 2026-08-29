import {
  OWNER_SUBMISSION_EDIT_GUARD_SQL,
  ownerSubmissionEditPolicy
} from "./submission-edit-policy.js";

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

function revisionExistsSql() {
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

export function nextSubmissionImageSortOrder(images) {
  if (!Array.isArray(images)) throw new TypeError("Submission image list is invalid");
  let next = 0;
  for (const image of images) {
    if (!Number.isInteger(image?.sortOrder) || image.sortOrder < 0) {
      throw new TypeError("Submission image sort order is invalid");
    }
    next = Math.max(next, image.sortOrder + 1);
  }
  return next;
}

export async function getOwnedSubmissionImage(db, competitionId, submissionId, imageId, ownerSubject) {
  const database = requireDatabase(db);
  return database.prepare(`
    SELECT
      i.id,
      i.submission_id AS submissionId,
      i.sort_order AS sortOrder,
      i.storage_key AS storageKey,
      i.sha256,
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
      AND s.owner_subject = ?
      AND i.id = ?
    LIMIT 1
  `).bind(competitionId, submissionId, ownerSubject, imageId).first();
}

export async function attachSubmissionImage(db, image) {
  const database = requireWritableDatabase(db);
  if (!Number.isInteger(image.sortOrder) || image.sortOrder < 0) {
    throw new TypeError("Submission image sort order is invalid");
  }
  const policy = ownerSubmissionEditPolicy({
    expectedConfigVersion: image.expectedConfigVersion,
    operationAt: image.createdAt,
    reviewCloseAt: image.reviewCloseAt
  });
  const nextRevision = image.expectedRevision + 1;
  const marker = revisionExistsSql();
  const results = await database.batch([
    database.prepare(`
      UPDATE submissions
      SET revision = ?,
          updated_at = ?,
          cover_image_id = COALESCE(cover_image_id, ?)
      WHERE id = ?
        AND competition_id = ?
        AND owner_subject = ?
        AND revision = ?
        AND status IN ('DRAFT','NEEDS_CHANGES')
        AND removed_at IS NULL
        AND ${OWNER_SUBMISSION_EDIT_GUARD_SQL}
    `).bind(
      nextRevision,
      policy.operationAt,
      image.id,
      image.submissionId,
      image.competitionId,
      image.ownerSubject,
      image.expectedRevision,
      policy.configVersion,
      policy.reviewCloseAt,
      policy.operationAt,
      policy.reviewCloseAt
    ),
    database.prepare(`
      INSERT INTO submission_images (
        id, submission_id, sort_order, storage_key, sha256, mime_type,
        byte_size, width, height, moderation_state, created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PASSED', ?
      WHERE ${marker}
    `).bind(
      image.id,
      image.submissionId,
      image.sortOrder,
      image.storageKey,
      image.sha256,
      image.mimeType,
      image.byteSize,
      image.width,
      image.height,
      policy.operationAt,
      image.submissionId,
      image.competitionId,
      image.ownerSubject,
      nextRevision,
      policy.operationAt
    ),
    database.prepare(`
      INSERT INTO moderation_checks (
        id, competition_id, submission_id, target_type, target_id,
        provider, model, outcome, categories_json, scores_json,
        content_hash, checked_at
      )
      SELECT ?, ?, ?, 'IMAGE', ?, ?, ?, 'PASSED', ?, ?, ?, ?
      WHERE ${marker}
    `).bind(
      image.moderationCheckId,
      image.competitionId,
      image.submissionId,
      image.id,
      image.moderation.provider,
      image.moderation.model,
      JSON.stringify(image.moderation.categories ?? {}),
      JSON.stringify(image.moderation.scores ?? {}),
      image.sha256,
      policy.operationAt,
      image.submissionId,
      image.competitionId,
      image.ownerSubject,
      nextRevision,
      policy.operationAt
    ),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, submission_id, actor_subject, actor_uuid,
        action, after_json, note, created_at
      )
      SELECT ?, ?, ?, ?, ?, 'SUBMISSION_IMAGE_ADDED', ?, ?, ?
      WHERE ${marker}
    `).bind(
      image.auditEventId,
      image.competitionId,
      image.submissionId,
      image.ownerSubject,
      image.actorUuid,
      JSON.stringify({ imageId: image.id, sortOrder: image.sortOrder, revision: nextRevision }),
      "Submission image added",
      policy.operationAt,
      image.submissionId,
      image.competitionId,
      image.ownerSubject,
      nextRevision,
      policy.operationAt
    )
  ]);

  const updated = Number(results?.[0]?.meta?.changes ?? 0) === 1;
  const inserted = Number(results?.[1]?.meta?.changes ?? 0) === 1;
  return updated && inserted
    ? { status: "UPDATED", revision: nextRevision }
    : { status: "CONFLICT" };
}

export async function removeSubmissionImage(db, removal) {
  const database = requireWritableDatabase(db);
  const policy = ownerSubmissionEditPolicy({
    expectedConfigVersion: removal.expectedConfigVersion,
    operationAt: removal.removedAt,
    reviewCloseAt: removal.reviewCloseAt
  });
  const nextRevision = removal.expectedRevision + 1;
  const marker = revisionExistsSql();
  const results = await database.batch([
    database.prepare(`
      UPDATE submissions
      SET revision = ?, updated_at = ?
      WHERE id = ?
        AND competition_id = ?
        AND owner_subject = ?
        AND revision = ?
        AND status IN ('DRAFT','NEEDS_CHANGES')
        AND removed_at IS NULL
        AND ${OWNER_SUBMISSION_EDIT_GUARD_SQL}
        AND EXISTS (
          SELECT 1 FROM submission_images i
          WHERE i.submission_id = submissions.id
            AND i.id = ?
            AND i.removed_at IS NULL
        )
    `).bind(
      nextRevision,
      policy.operationAt,
      removal.submissionId,
      removal.competitionId,
      removal.ownerSubject,
      removal.expectedRevision,
      policy.configVersion,
      policy.reviewCloseAt,
      policy.operationAt,
      policy.reviewCloseAt,
      removal.imageId
    ),
    database.prepare(`
      UPDATE submission_images
      SET removed_at = ?, removed_by_uuid = ?
      WHERE submission_id = ?
        AND id = ?
        AND removed_at IS NULL
        AND ${marker}
    `).bind(
      policy.operationAt,
      removal.actorUuid,
      removal.submissionId,
      removal.imageId,
      removal.submissionId,
      removal.competitionId,
      removal.ownerSubject,
      nextRevision,
      policy.operationAt
    ),
    database.prepare(`
      UPDATE submissions
      SET cover_image_id = CASE
        WHEN cover_image_id = ? THEN (
          SELECT id
          FROM submission_images
          WHERE submission_id = ?
            AND removed_at IS NULL
          ORDER BY sort_order ASC, id ASC
          LIMIT 1
        )
        ELSE cover_image_id
      END
      WHERE id = ?
        AND competition_id = ?
        AND owner_subject = ?
        AND revision = ?
        AND updated_at = ?
    `).bind(
      removal.imageId,
      removal.submissionId,
      removal.submissionId,
      removal.competitionId,
      removal.ownerSubject,
      nextRevision,
      policy.operationAt
    ),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, submission_id, actor_subject, actor_uuid,
        action, after_json, note, created_at
      )
      SELECT ?, ?, ?, ?, ?, 'SUBMISSION_IMAGE_REMOVED', ?, ?, ?
      WHERE ${marker}
    `).bind(
      removal.auditEventId,
      removal.competitionId,
      removal.submissionId,
      removal.ownerSubject,
      removal.actorUuid,
      JSON.stringify({ imageId: removal.imageId, revision: nextRevision }),
      "Submission image removed",
      policy.operationAt,
      removal.submissionId,
      removal.competitionId,
      removal.ownerSubject,
      nextRevision,
      policy.operationAt
    )
  ]);

  return Number(results?.[0]?.meta?.changes ?? 0) === 1
    ? { status: "UPDATED", revision: nextRevision }
    : { status: "CONFLICT" };
}
