const REQUIRED_SCHEMA_OBJECTS = Object.freeze([
  ["table", "competitions"],
  ["table", "competition_config_versions"],
  ["table", "competition_audit_events"],
  ["table", "submissions"],
  ["table", "competition_result_drafts"],
  ["table", "competition_notification_outbox"],
  ["table", "competition_discord_outbox"],
  ["table", "competition_discord_accounts"],
  ["table", "competition_minecraft_links"],
  ["table", "competition_minecraft_identity_locks"],
  ["table", "competition_gallery_promotions"],
  ["table", "competition_deleted_drafts"],
  ["trigger", "competition_vote_linked_identity_guard"],
  ["trigger", "competition_submission_review_discord_notification"],
  ["trigger", "competition_minecraft_link_identity_lock_insert"]
]);

function rows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

export async function currentCompetitionSchemaStatus(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("Competition database binding is unavailable");
  }
  const names = REQUIRED_SCHEMA_OBJECTS.map(([, name]) => name);
  const placeholders = names.map(() => "?").join(",");
  const result = await db.prepare(`
    SELECT type, name
    FROM sqlite_master
    WHERE name IN (${placeholders})
  `).bind(...names).all();
  const found = new Set(rows(result).map((row) => `${row.type}:${row.name}`));
  const missing = REQUIRED_SCHEMA_OBJECTS
    .filter(([type, name]) => !found.has(`${type}:${name}`))
    .map(([type, name]) => ({ type, name }));
  return {
    ready: missing.length === 0,
    requiredObjectCount: REQUIRED_SCHEMA_OBJECTS.length,
    foundObjectCount: REQUIRED_SCHEMA_OBJECTS.length - missing.length,
    missing
  };
}

export async function currentCompetitionSchemaReady(db) {
  return (await currentCompetitionSchemaStatus(db)).ready;
}

export { REQUIRED_SCHEMA_OBJECTS };
