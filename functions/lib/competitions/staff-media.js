function requireDatabase(db) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("Competition database binding is unavailable");
  return db;
}

function requireWritableDatabase(db) {
  const database = requireDatabase(db);
  if (typeof database.batch !== "function") throw new TypeError("Competition database binding is not writable");
  return database;
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

export async function attachStaffSubmissionImage(db, image) {
  const database = requireWritableDatabase(db);
  if (!Number.isInteger(image.sortOrder) || image.sortOrder < 0) {
    throw new TypeError("Submission image sort order is invalid");
  }
  const nextRevision = image.expectedRevision + 1;
  const results = await database.batch([
    database.prepare(`
      UPDATE submissions
      SET revision = ?,
          staff_edited = 1,
          updated_at = ?,
          cover_image_id = COALESCE(cover_image_id, ?)
      WHERE id = ?
        AND competition_id = ?
        AND revision = ?
        AND owner_subject LIKE 'staff-manual:%'
        AND removed_at IS NULL
        AND status IN ('PENDING_REVIEW','NEEDS_CHANGES')
    `).bind(
      nextRevision,
      image.createdAt,
      image.id,
      image.submissionId,
      image.competitionId,
      image.expectedRevision
    ),
    database.prepare(`
      INSERT INTO submission_images (
        id, submission_id, sort_order, storage_key, sha256, mime_type,
        byte_size, width, height, moderation_state, created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PASSED', ?
      WHERE EXISTS (
        SELECT 1 FROM submissions s
        WHERE s.id = ?
          AND s.competition_id = ?
          AND s.revision = ?
          AND s.updated_at = ?
          AND s.owner_subject LIKE 'staff-manual:%'
      )
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
      image.createdAt,
      image.submissionId,
      image.competitionId,
      nextRevision,
      image.createdAt
    ),
    database.prepare(`
      INSERT INTO moderation_checks (
        id, competition_id, submission_id, target_type, target_id,
        provider, model, outcome, categories_json, scores_json,
        content_hash, checked_at
      )
      SELECT ?, ?, ?, 'IMAGE', ?, ?, ?, 'PASSED', ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM submission_images i
        WHERE i.submission_id = ? AND i.id = ? AND i.removed_at IS NULL
      )
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
      image.createdAt,
      image.submissionId,
      image.id
    ),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, submission_id, actor_subject, actor_uuid,
        action, after_json, note, created_at
      )
      SELECT ?, ?, ?, ?, ?, 'SUBMISSION_IMAGE_ADDED_BY_STAFF', ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM submission_images i
        WHERE i.submission_id = ? AND i.id = ? AND i.removed_at IS NULL
      )
    `).bind(
      image.auditEventId,
      image.competitionId,
      image.submissionId,
      image.actorSubject,
      image.actorUuid,
      JSON.stringify({ imageId: image.id, sortOrder: image.sortOrder, revision: nextRevision, staffEdited: true }),
      image.privateNote ?? "Image added to staff-managed submission",
      image.createdAt,
      image.submissionId,
      image.id
    )
  ]);
  const updated = Number(results?.[0]?.meta?.changes ?? 0) === 1;
  const inserted = Number(results?.[1]?.meta?.changes ?? 0) === 1;
  return updated && inserted
    ? { status: "UPDATED", revision: nextRevision }
    : { status: "CONFLICT" };
}

export async function removeStaffSubmissionImage(db, removal) {
  const database = requireWritableDatabase(db);
  const nextRevision = removal.expectedRevision + 1;
  const results = await database.batch([
    database.prepare(`
      UPDATE submissions
      SET revision = ?,
          staff_edited = 1,
          updated_at = ?
      WHERE id = ?
        AND competition_id = ?
        AND revision = ?
        AND EXISTS (
          SELECT 1 FROM submission_images i
          WHERE i.submission_id = submissions.id
            AND i.id = ?
            AND i.removed_at IS NULL
        )
    `).bind(
      nextRevision,
      removal.removedAt,
      removal.submissionId,
      removal.competitionId,
      removal.expectedRevision,
      removal.imageId
    ),
    database.prepare(`
      UPDATE submission_images
      SET removed_at = ?, removed_by_uuid = ?
      WHERE submission_id = ?
        AND id = ?
        AND removed_at IS NULL
        AND EXISTS (
          SELECT 1 FROM submissions s
          WHERE s.id = ?
            AND s.competition_id = ?
            AND s.revision = ?
            AND s.updated_at = ?
        )
    `).bind(
      removal.removedAt,
      removal.removedByUuid,
      removal.submissionId,
      removal.imageId,
      removal.submissionId,
      removal.competitionId,
      nextRevision,
      removal.removedAt
    ),
    database.prepare(`
      UPDATE submissions
      SET cover_image_id = CASE
        WHEN cover_image_id = ? THEN (
          SELECT id FROM submission_images
          WHERE submission_id = ? AND removed_at IS NULL
          ORDER BY sort_order ASC, id ASC
          LIMIT 1
        )
        ELSE cover_image_id
      END
      WHERE id = ?
        AND competition_id = ?
        AND revision = ?
        AND updated_at = ?
    `).bind(
      removal.imageId,
      removal.submissionId,
      removal.submissionId,
      removal.competitionId,
      nextRevision,
      removal.removedAt
    ),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, submission_id, actor_subject, actor_uuid,
        action, after_json, note, created_at
      )
      SELECT ?, ?, ?, ?, ?, 'SUBMISSION_IMAGE_REMOVED_BY_STAFF', ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM submission_images
        WHERE submission_id = ? AND id = ? AND removed_at = ?
      )
    `).bind(
      removal.auditEventId,
      removal.competitionId,
      removal.submissionId,
      removal.actorSubject,
      removal.removedByUuid,
      JSON.stringify({ imageId: removal.imageId, revision: nextRevision, staffEdited: true }),
      removal.privateNote,
      removal.removedAt,
      removal.submissionId,
      removal.imageId,
      removal.removedAt
    )
  ]);
  return Number(results?.[0]?.meta?.changes ?? 0) === 1
    ? { status: "UPDATED", revision: nextRevision }
    : { status: "CONFLICT" };
}
