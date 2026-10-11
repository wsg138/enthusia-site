function requireDatabase(db) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("Competition database binding is unavailable");
  return db;
}

const PUBLIC_ENTRY_STATES_SQL = "'VOTING','JUDGING','RESULTS_READY','COMPLETED','ARCHIVED'";

export async function listPublicSubmissionImages(db, competitionId) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    SELECT
      i.id,
      i.submission_id AS submissionId,
      i.sort_order AS sortOrder,
      i.mime_type AS mimeType,
      i.width,
      i.height,
      i.byte_size AS byteSize,
      s.cover_image_id AS coverImageId
    FROM submission_images i
    JOIN submissions s ON s.id = i.submission_id
    JOIN competitions c ON c.id = s.competition_id
    WHERE s.competition_id = ?
      AND s.status = 'APPROVED'
      AND s.removed_at IS NULL
      AND i.removed_at IS NULL
      AND i.moderation_state = 'PASSED'
      AND c.visibility IN ('PUBLIC','UNLISTED')
      AND c.published_at IS NOT NULL
      AND c.lifecycle_state IN (${PUBLIC_ENTRY_STATES_SQL})
    ORDER BY i.submission_id ASC, i.sort_order ASC, i.id ASC
  `).bind(competitionId).all();
  return Array.isArray(result?.results) ? result.results : [];
}

export async function getPublicSubmissionImage(db, imageId) {
  const database = requireDatabase(db);
  return database.prepare(`
    SELECT
      i.id,
      i.storage_key AS storageKey,
      i.mime_type AS mimeType,
      i.width,
      i.height,
      i.byte_size AS byteSize,
      i.submission_id AS submissionId,
      s.competition_id AS competitionId
    FROM submission_images i
    JOIN submissions s ON s.id = i.submission_id
    JOIN competitions c ON c.id = s.competition_id
    WHERE i.id = ?
      AND i.removed_at IS NULL
      AND i.moderation_state = 'PASSED'
      AND s.status = 'APPROVED'
      AND s.removed_at IS NULL
      AND c.visibility IN ('PUBLIC','UNLISTED')
      AND c.published_at IS NOT NULL
      AND c.lifecycle_state IN (${PUBLIC_ENTRY_STATES_SQL})
    LIMIT 1
  `).bind(imageId).first();
}
