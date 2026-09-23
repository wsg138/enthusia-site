function requireWritableDatabase(db) {
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new TypeError("Competition database binding is not writable");
  }
  return db;
}

export async function deleteCompetitionDraft(db, deletion) {
  const database = requireWritableDatabase(db);
  const results = await database.batch([
    database.prepare(`
      INSERT INTO competition_deleted_drafts (
        competition_id, slug, title, category,
        deleted_by_subject, deleted_by_uuid, deleted_at, reason
      )
      SELECT id, slug, title, category, ?, ?, ?, ?
      FROM competitions
      WHERE id = ? AND lifecycle_state = 'DRAFT'
    `).bind(
      deletion.deletedBySubject,
      deletion.deletedByUuid,
      deletion.deletedAt,
      deletion.reason,
      deletion.competitionId
    ),
    database.prepare(`
      DELETE FROM competitions
      WHERE id = ? AND lifecycle_state = 'DRAFT'
    `).bind(deletion.competitionId)
  ]);
  return Number(results?.[1]?.meta?.changes ?? 0) === 1;
}
