import { competitionGuildMembers } from "./bridge.js";

function requireDatabase(db) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("Competition database binding is unavailable");
  return db;
}

async function staffIdentityUuids(db, staffUuid) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    WITH staff_discord AS (
      SELECT discord_user_id
      FROM competition_minecraft_links
      WHERE minecraft_uuid = ?
      UNION
      SELECT discord_user_id
      FROM competition_minecraft_identity_locks
      WHERE minecraft_uuid = ?
    )
    SELECT minecraft_uuid AS minecraftUuid
    FROM competition_minecraft_links
    WHERE discord_user_id IN (SELECT discord_user_id FROM staff_discord)
    UNION
    SELECT minecraft_uuid AS minecraftUuid
    FROM competition_minecraft_identity_locks
    WHERE discord_user_id IN (SELECT discord_user_id FROM staff_discord)
  `).bind(staffUuid, staffUuid).all();
  const values = new Set([staffUuid]);
  for (const row of result?.results ?? []) {
    const uuid = String(row?.minecraftUuid ?? "").trim().toLowerCase();
    if (uuid) values.add(uuid);
  }
  return [...values];
}

export async function staffSubmissionConflict(db, env, submission, staffUuid) {
  const database = requireDatabase(db);
  const normalizedStaffUuid = String(staffUuid ?? "").trim().toLowerCase();
  if (!normalizedStaffUuid || !submission?.id) throw new TypeError("Staff conflict identity is invalid");
  const identityUuids = await staffIdentityUuids(database, normalizedStaffUuid);
  const placeholders = identityUuids.map(() => "?").join(",");

  if (identityUuids.includes(String(submission.ownerUuid ?? "").trim().toLowerCase())) {
    return { conflict: true, reason: "OWNER_OR_LINKED_OWNER" };
  }

  const participant = await database.prepare(`
    SELECT player_uuid AS playerUuid, participant_role AS role
    FROM submission_participants
    WHERE submission_id = ?
      AND invite_status = 'ACCEPTED'
      AND player_uuid IN (${placeholders})
    LIMIT 1
  `).bind(submission.id, ...identityUuids).first();
  if (participant) {
    return { conflict: true, reason: "PARTICIPANT_OR_LINKED_PARTICIPANT", role: participant.role };
  }

  if (submission.entryType === "GUILD" && submission.guildId) {
    const members = await competitionGuildMembers(env, submission.guildId);
    if (!members) throw new Error("Competition guild membership is unavailable");
    const memberSet = new Set(members.map((uuid) => String(uuid).toLowerCase()));
    if (identityUuids.some((uuid) => memberSet.has(uuid))) {
      return { conflict: true, reason: "GUILD_MEMBER_OR_LINKED_GUILD_MEMBER" };
    }
  }

  return { conflict: false, reason: null };
}

export { staffIdentityUuids };
