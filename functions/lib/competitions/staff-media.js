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
