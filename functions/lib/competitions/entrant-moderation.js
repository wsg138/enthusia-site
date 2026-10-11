function requireDatabase(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("Competition database binding is unavailable");
  }
  return db;
}

export async function getEntrantModerationNotice(db, competitionId, submissionId, ownerSubject) {
  const database = requireDatabase(db);
  const row = await database.prepare(`
    SELECT
      s.status,
      sm.public_reason AS publicReason,
      sm.reviewed_at AS reviewedAt
    FROM submissions s
    LEFT JOIN submission_moderation sm ON sm.submission_id = s.id
    WHERE s.competition_id = ?
      AND s.id = ?
      AND s.owner_subject = ?
      AND s.removed_at IS NULL
    LIMIT 1
  `).bind(competitionId, submissionId, ownerSubject).first();
  if (!row) return null;
  return {
    status: row.status,
    publicReason: typeof row.publicReason === "string" && row.publicReason.trim() ? row.publicReason.trim() : null,
    reviewedAt: row.reviewedAt ?? null
  };
}

export async function listEntrantModerationNotices(db, competitionId, ownerSubject) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    SELECT
      s.id AS submissionId,
      s.status,
      sm.public_reason AS publicReason,
      sm.reviewed_at AS reviewedAt
    FROM submissions s
    LEFT JOIN submission_moderation sm ON sm.submission_id = s.id
    WHERE s.competition_id = ?
      AND s.owner_subject = ?
      AND s.removed_at IS NULL
  `).bind(competitionId, ownerSubject).all();
  const rows = Array.isArray(result?.results) ? result.results : [];
  return new Map(rows.map((row) => [row.submissionId, {
    status: row.status,
    publicReason: typeof row.publicReason === "string" && row.publicReason.trim() ? row.publicReason.trim() : null,
    reviewedAt: row.reviewedAt ?? null
  }]));
}
