function requireDatabase(db) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("Competition database binding is unavailable");
  return db;
}

function discordUserIdFromSubject(subject) {
  const value = String(subject ?? "").trim();
  const match = /^discord:(\d{16,22})$/.exec(value);
  return match ? match[1] : null;
}

export async function countDiscordIdentityEntrySlots(db, competitionId, subject) {
  const database = requireDatabase(db);
  const discordUserId = discordUserIdFromSubject(subject);
  if (!discordUserId) throw new TypeError("Discord competition subject is required");
  const row = await database.prepare(`
    WITH identity_uuids AS (
      SELECT minecraft_uuid
      FROM competition_minecraft_links
      WHERE discord_user_id = ?
      UNION
      SELECT minecraft_uuid
      FROM competition_minecraft_identity_locks
      WHERE discord_user_id = ?
    ), slot_rows AS (
      SELECT s.id AS submission_id
      FROM submissions s
      WHERE s.competition_id = ?
        AND s.entry_type IN ('SOLO','GROUP')
        AND (
          s.owner_subject = ?
          OR s.owner_uuid IN (SELECT minecraft_uuid FROM identity_uuids)
        )
        AND s.status NOT IN ('WITHDRAWN','REMOVED','REJECTED','DISQUALIFIED')
        AND s.removed_at IS NULL
      UNION
      SELECT p.submission_id
      FROM submission_participants p
      JOIN submissions s ON s.id = p.submission_id
      WHERE s.competition_id = ?
        AND p.player_uuid IN (SELECT minecraft_uuid FROM identity_uuids)
        AND p.invite_status = 'ACCEPTED'
        AND p.participant_role = 'MAIN'
        AND s.entry_type = 'GROUP'
        AND s.status NOT IN ('WITHDRAWN','REMOVED','REJECTED','DISQUALIFIED')
        AND s.removed_at IS NULL
    )
    SELECT COUNT(DISTINCT submission_id) AS entryCount
    FROM slot_rows
  `).bind(discordUserId, discordUserId, competitionId, subject, competitionId).first();
  return Number(row?.entryCount ?? 0);
}

export { discordUserIdFromSubject };
