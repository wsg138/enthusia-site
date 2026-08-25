function database(db) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("Appeal database is unavailable");
  return db;
}

function rows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function changes(result) {
  return Number(result?.meta?.changes ?? 0);
}

function attachment(row, previewBase = "/api/appeals/attachments") {
  return Object.freeze({
    id: row.id,
    name: row.displayName,
    mimeType: row.mimeType,
    byteSize: Number(row.byteSize),
    width: row.width === null || row.width === undefined ? null : Number(row.width),
    height: row.height === null || row.height === undefined ? null : Number(row.height),
    previewUrl: `${previewBase}/${row.id}`
  });
}

const ATTACHMENT_SELECT = `
  SELECT id, draft_id AS draftId, appeal_id AS appealId,
         owner_discord_id AS ownerDiscordId, storage_key AS storageKey,
         display_name AS displayName, mime_type AS mimeType,
         byte_size AS byteSize, sha256, width, height,
         created_at AS createdAt, expires_at AS expiresAt, attached_at AS attachedAt
  FROM appeal_attachments
`;

export async function draftAttachmentUsage(db, ownerDiscordId, draftId, now = new Date()) {
  const row = await database(db).prepare(`
    SELECT COUNT(*) AS attachmentCount, COALESCE(SUM(byte_size), 0) AS totalBytes
    FROM appeal_attachments
    WHERE owner_discord_id = ? AND draft_id = ? AND appeal_id IS NULL AND expires_at > ?
  `).bind(ownerDiscordId, draftId, now.toISOString()).first();
  return { attachmentCount: Number(row?.attachmentCount ?? 0), totalBytes: Number(row?.totalBytes ?? 0) };
}

export async function listDraftAttachments(db, ownerDiscordId, draftId, now = new Date()) {
  const result = await database(db).prepare(`${ATTACHMENT_SELECT}
    WHERE owner_discord_id = ? AND draft_id = ? AND appeal_id IS NULL AND expires_at > ?
    ORDER BY created_at ASC
  `).bind(ownerDiscordId, draftId, now.toISOString()).all();
  return rows(result).map((row) => attachment(row));
}

export async function insertAppealAttachment(db, record) {
  const result = await database(db).prepare(`
    INSERT INTO appeal_attachments (
      id, draft_id, appeal_id, owner_discord_id, storage_key, display_name,
      mime_type, byte_size, sha256, width, height, created_at, expires_at, attached_at
    ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).bind(
    record.id,
    record.draftId,
    record.ownerDiscordId,
    record.storageKey,
    record.displayName,
    record.mimeType,
    record.byteSize,
    record.sha256,
    record.width,
    record.height,
    record.createdAt,
    record.expiresAt
  ).run();
  if (changes(result) !== 1) throw new Error("Appeal attachment was not recorded");
  return attachment({
    id: record.id,
    displayName: record.displayName,
    mimeType: record.mimeType,
    byteSize: record.byteSize,
    width: record.width,
    height: record.height
  });
}

export async function findOwnedAppealAttachment(db, ownerDiscordId, attachmentId) {
  return database(db).prepare(`${ATTACHMENT_SELECT}
    WHERE owner_discord_id = ? AND id = ? LIMIT 1
  `).bind(ownerDiscordId, attachmentId).first();
}

export async function removeDraftAttachment(db, ownerDiscordId, attachmentId, draftId) {
  const result = await database(db).prepare(`
    DELETE FROM appeal_attachments
    WHERE owner_discord_id = ? AND id = ? AND draft_id = ? AND appeal_id IS NULL
  `).bind(ownerDiscordId, attachmentId, draftId).run();
  return changes(result) === 1;
}

async function attachmentRowsForSubmission(db, ownerDiscordId, draftId, ids, now) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const result = await database(db).prepare(`${ATTACHMENT_SELECT}
    WHERE owner_discord_id = ? AND draft_id = ? AND appeal_id IS NULL
      AND expires_at > ? AND id IN (${placeholders})
  `).bind(ownerDiscordId, draftId, now.toISOString(), ...ids).all();
  return rows(result);
}

export async function prepareAppealSubmission(db, {
  session,
  account,
  submission,
  payloadHash,
  now = new Date()
}) {
  const store = database(db);
  const existing = await store.prepare(`
    SELECT draft_id AS draftId, owner_discord_id AS ownerDiscordId,
           payload_hash AS payloadHash, status, appeal_id AS appealId
    FROM appeal_submissions WHERE draft_id = ? LIMIT 1
  `).bind(submission.draftId).first();
  if (existing) {
    if (existing.ownerDiscordId !== session.discord.id || existing.payloadHash !== payloadHash) {
      return { status: "CONFLICT" };
    }
    return { status: existing.status, appealId: existing.appealId ?? null };
  }

  const selectedAttachments = await attachmentRowsForSubmission(
    store,
    session.discord.id,
    submission.draftId,
    submission.attachmentIds,
    now
  );
  if (selectedAttachments.length !== submission.attachmentIds.length) return { status: "ATTACHMENT_CONFLICT" };

  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  await store.prepare(`
    INSERT OR IGNORE INTO appeal_submissions (
      draft_id, appeal_id, owner_discord_id, minecraft_uuid, minecraft_name,
      punishment_id, answers_json, attachment_ids_json, staff_reason, payload_hash,
      status, created_at, updated_at, expires_at, submitted_at
    ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'PREPARING', ?, ?, ?, NULL)
  `).bind(
    submission.draftId,
    session.discord.id,
    account.uuid,
    account.name,
    submission.punishmentId,
    JSON.stringify(submission.answers),
    JSON.stringify(submission.attachmentIds),
    submission.staffReason,
    payloadHash,
    nowIso,
    nowIso,
    expiresAt
  ).run();

  const prepared = await store.prepare(`
    SELECT owner_discord_id AS ownerDiscordId, payload_hash AS payloadHash,
           status, appeal_id AS appealId
    FROM appeal_submissions WHERE draft_id = ? LIMIT 1
  `).bind(submission.draftId).first();
  if (!prepared || prepared.ownerDiscordId !== session.discord.id || prepared.payloadHash !== payloadHash) {
    return { status: "CONFLICT" };
  }
  return { status: prepared.status, appealId: prepared.appealId ?? null };
}

export async function finalizeAppealSubmission(db, {
  ownerDiscordId,
  draftId,
  payloadHash,
  appealId,
  attachmentIds,
  now = new Date()
}) {
  const store = database(db);
  const nowIso = now.toISOString();
  const operations = [store.prepare(`
    UPDATE appeal_submissions
    SET appeal_id = ?, status = 'SUBMITTED', submitted_at = COALESCE(submitted_at, ?), updated_at = ?
    WHERE draft_id = ? AND owner_discord_id = ? AND payload_hash = ?
      AND (appeal_id IS NULL OR appeal_id = ?)
  `).bind(appealId, nowIso, nowIso, draftId, ownerDiscordId, payloadHash, appealId)];
  for (const attachmentId of attachmentIds) {
    operations.push(store.prepare(`
      UPDATE appeal_attachments
      SET appeal_id = ?, attached_at = COALESCE(attached_at, ?)
      WHERE id = ? AND draft_id = ? AND owner_discord_id = ?
        AND (appeal_id IS NULL OR appeal_id = ?)
    `).bind(appealId, nowIso, attachmentId, draftId, ownerDiscordId, appealId));
  }
  const result = await store.batch(operations);
  if (changes(result?.[0]) !== 1 || result.slice(1).some((entry) => changes(entry) !== 1)) {
    throw new Error("Appeal submission could not be finalized");
  }
}

export async function appealDetailsByIds(db, appealIds) {
  const ids = [...new Set(appealIds.filter((id) => typeof id === "string" && id))];
  if (!ids.length) return new Map();
  const store = database(db);
  const placeholders = ids.map(() => "?").join(", ");
  const submissions = rows(await store.prepare(`
    SELECT appeal_id AS appealId, answers_json AS answersJson
    FROM appeal_submissions
    WHERE status = 'SUBMITTED' AND appeal_id IN (${placeholders})
  `).bind(...ids).all());
  const evidence = rows(await store.prepare(`${ATTACHMENT_SELECT}
    WHERE appeal_id IN (${placeholders}) ORDER BY created_at ASC
  `).bind(...ids).all());
  const byAppeal = new Map();
  for (const row of submissions) {
    let answers;
    try { answers = JSON.parse(row.answersJson); } catch { throw new Error("Stored appeal response is invalid"); }
    if (!answers || typeof answers !== "object") throw new Error("Stored appeal response is invalid");
    byAppeal.set(row.appealId, { answers, attachments: [] });
  }
  for (const row of evidence) {
    const details = byAppeal.get(row.appealId);
    if (details) details.attachments.push(attachment(row, "/api/reviewer/appeals/attachments"));
  }
  return byAppeal;
}

export async function findReviewerAppealAttachment(db, attachmentId) {
  return database(db).prepare(`${ATTACHMENT_SELECT}
    WHERE id = ? AND appeal_id IS NOT NULL LIMIT 1
  `).bind(attachmentId).first();
}

export { attachment };
