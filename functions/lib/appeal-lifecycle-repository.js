function database(db) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("Appeal database is unavailable");
  return db;
}

function changes(result) {
  return Number(result?.meta?.changes ?? 0);
}

function placeholders(values) {
  return values.map(() => "?").join(", ");
}

function lifecycle(row) {
  return row ? Object.freeze({
    id: row.id,
    status: row.status,
    version: Number(row.version),
    claimed: Number(row.claimed) === 1,
    answersJson: row.answersJson,
    staffReason: row.staffReason
  }) : null;
}

const LIFECYCLE_SELECT = `
  SELECT appeal_id AS id, current_status AS status, current_version AS version,
         current_claimed AS claimed, answers_json AS answersJson,
         staff_reason AS staffReason
  FROM appeal_submissions
`;

export async function findOwnedAppealLifecycle(db, ownerDiscordId, appealId) {
  const row = await database(db).prepare(`${LIFECYCLE_SELECT}
    WHERE owner_discord_id = ? AND appeal_id = ? AND status = 'SUBMITTED'
    LIMIT 1
  `).bind(ownerDiscordId, appealId).first();
  return lifecycle(row);
}

export async function appealLifecycleByIds(db, appealIds) {
  const ids = [...new Set(appealIds.filter((value) => typeof value === "string" && value))];
  if (!ids.length) return new Map();
  const result = await database(db).prepare(`${LIFECYCLE_SELECT}
    WHERE status = 'SUBMITTED' AND appeal_id IN (${placeholders(ids)})
  `).bind(...ids).all();
  const mapped = new Map();
  for (const row of result?.results ?? []) mapped.set(row.id, lifecycle(row));
  return mapped;
}

export async function recordAppealEditMirror(db, {
  ownerDiscordId,
  appealId,
  answers,
  staffReason,
  version,
  updatedAt
}) {
  const result = await database(db).prepare(`
    UPDATE appeal_submissions
    SET answers_json = ?, staff_reason = ?, current_version = ?,
        status_updated_at = ?, updated_at = ?
    WHERE owner_discord_id = ? AND appeal_id = ? AND status = 'SUBMITTED'
      AND current_status = 'OPEN' AND current_claimed = 0 AND current_version <= ?
  `).bind(
    JSON.stringify(answers),
    staffReason,
    version,
    updatedAt,
    updatedAt,
    ownerDiscordId,
    appealId,
    version
  ).run();
  return changes(result) === 1;
}

export async function recordAppealLifecycleMirror(db, {
  appealId,
  status,
  version,
  claimed,
  updatedAt
}) {
  const result = await database(db).prepare(`
    UPDATE appeal_submissions
    SET current_status = ?, current_version = ?, current_claimed = ?,
        status_updated_at = ?, updated_at = ?
    WHERE appeal_id = ? AND appeal_submissions.status = 'SUBMITTED'
      AND current_version <= ?
  `).bind(
    status,
    version,
    claimed ? 1 : 0,
    updatedAt,
    updatedAt,
    appealId,
    version
  ).run();
  return changes(result) === 1;
}
