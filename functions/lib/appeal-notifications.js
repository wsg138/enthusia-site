import {
  discordBotConfiguration,
  discordDmFailureIsPermanent,
  discordRetryAt,
  sendDiscordDirectMessage
} from "./competitions/discord-notifications.js";

const MAX_ERROR_LENGTH = 500;

function rows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function parsePayload(row) {
  let payload = {};
  try {
    const parsed = JSON.parse(row.payloadJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed;
  } catch {
    // A malformed durable event must fail safely during delivery.
  }
  return { ...row, payload, payloadJson: undefined };
}

function siteOrigin(env) {
  const raw = String(env?.COMPETITIONS_SITE_ORIGIN ?? "").trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
  return url.origin;
}

export function appealUpdateUrl(env, notification) {
  const origin = siteOrigin(env);
  const appealId = String(notification?.payload?.appealId ?? "").trim().toLowerCase();
  if (!origin || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(appealId)) {
    return null;
  }
  return `${origin}/appeal.html?appeal=${encodeURIComponent(appealId)}#history`;
}

export function appealUpdateMessage(env, notification) {
  if (notification?.eventType !== "APPEAL_UPDATE") {
    throw new Error(`Unsupported appeal Discord event: ${notification?.eventType}`);
  }
  const url = appealUpdateUrl(env, notification);
  const lines = [
    "There is an update on your Enthusia appeal.",
    "Sign in to read the message and check its status."
  ];
  if (url) lines.push(url);
  return { content: lines.join("\n"), allowed_mentions: { parse: [] } };
}

export async function listPendingAppealDiscordNotifications(db, nowIso, limit = 25) {
  const safeLimit = Number.isInteger(limit) ? Math.min(100, Math.max(1, limit)) : 25;
  const result = await db.prepare(`
    SELECT id, appeal_id AS appealId,
           owner_discord_id AS recipientDiscordUserId,
           event_type AS eventType, operation_key AS operationKey,
           payload_json AS payloadJson, state, attempts,
           next_attempt_at AS nextAttemptAt, created_at AS createdAt,
           updated_at AS updatedAt
    FROM appeal_discord_outbox
    WHERE state IN ('PENDING','FAILED') AND next_attempt_at <= ?
    ORDER BY created_at ASC, id ASC
    LIMIT ?
  `).bind(nowIso, safeLimit).all();
  return rows(result).map(parsePayload);
}

export async function claimAppealDiscordNotification(db, id, claimedAt) {
  const result = await db.prepare(`
    UPDATE appeal_discord_outbox
    SET state = 'DELIVERING', attempts = attempts + 1, updated_at = ?
    WHERE id = ? AND state IN ('PENDING','FAILED') AND next_attempt_at <= ?
  `).bind(claimedAt, id, claimedAt).run();
  return Number(result?.meta?.changes ?? 0) === 1;
}

export async function completeAppealDiscordNotification(db, id, deliveredAt) {
  await db.prepare(`
    UPDATE appeal_discord_outbox
    SET state = 'DELIVERED', delivered_at = ?, updated_at = ?, last_error = NULL
    WHERE id = ? AND state = 'DELIVERING'
  `).bind(deliveredAt, deliveredAt, id).run();
}

export async function failAppealDiscordNotification(db, id, { failedAt, nextAttemptAt, error }) {
  await db.prepare(`
    UPDATE appeal_discord_outbox
    SET state = 'FAILED', next_attempt_at = ?, last_error = ?, updated_at = ?
    WHERE id = ? AND state = 'DELIVERING'
  `).bind(
    nextAttemptAt,
    String(error ?? "discord_delivery_failed").slice(0, MAX_ERROR_LENGTH),
    failedAt,
    id
  ).run();
}

export async function abandonAppealDiscordNotification(db, id, abandonedAt, reason) {
  await db.prepare(`
    UPDATE appeal_discord_outbox
    SET state = 'ABANDONED', last_error = ?, updated_at = ?
    WHERE id = ? AND state = 'DELIVERING'
  `).bind(String(reason ?? "recipient_unreachable").slice(0, MAX_ERROR_LENGTH), abandonedAt, id).run();
}

export async function recoverStaleAppealDiscordNotifications(db, nowIso, leaseSeconds = 300) {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) throw new TypeError("Appeal Discord recovery timestamp is invalid");
  const lease = Number.isInteger(leaseSeconds) ? Math.max(60, Math.min(3600, leaseSeconds)) : 300;
  const staleBefore = new Date(now - lease * 1000).toISOString();
  const result = await db.prepare(`
    UPDATE appeal_discord_outbox
    SET state = 'FAILED', next_attempt_at = ?,
        last_error = COALESCE(last_error, 'delivery_lease_expired'), updated_at = ?
    WHERE state = 'DELIVERING' AND updated_at <= ?
  `).bind(nowIso, nowIso, staleBefore).run();
  return Number(result?.meta?.changes ?? 0);
}

export async function deliverAppealDiscordNotification(env, notification, fetchImpl = fetch) {
  return sendDiscordDirectMessage(
    env,
    notification.recipientDiscordUserId,
    appealUpdateMessage(env, notification),
    fetchImpl
  );
}

export async function drainAppealDiscordNotifications(env, db, { limit = 25, fetchImpl = fetch } = {}) {
  if (!appealDiscordConfigured(env)) return [];
  const pending = await listPendingAppealDiscordNotifications(db, new Date().toISOString(), limit);
  const outcomes = [];
  for (const notification of pending) {
    const claimedAt = new Date().toISOString();
    if (!await claimAppealDiscordNotification(db, notification.id, claimedAt)) continue;
    try {
      const delivery = await deliverAppealDiscordNotification(env, notification, fetchImpl);
      const deliveredAt = new Date().toISOString();
      await completeAppealDiscordNotification(db, notification.id, deliveredAt);
      outcomes.push({ id: notification.id, status: delivery.status });
    } catch (error) {
      const failedAt = new Date().toISOString();
      if (discordDmFailureIsPermanent(error)) {
        await abandonAppealDiscordNotification(db, notification.id, failedAt, "recipient_unreachable");
        outcomes.push({ id: notification.id, status: "UNREACHABLE" });
        continue;
      }
      await failAppealDiscordNotification(db, notification.id, {
        failedAt,
        nextAttemptAt: discordRetryAt(failedAt, Number(notification.attempts ?? 0) + 1),
        error: String(error?.message ?? error)
      });
      outcomes.push({ id: notification.id, status: "FAILED" });
    }
  }
  return outcomes;
}

export function scheduleAppealDiscordDrain(context, options = {}) {
  if (!context?.waitUntil || !context?.env?.COMPETITIONS_DB || !appealDiscordConfigured(context.env)) return;
  context.waitUntil(
    drainAppealDiscordNotifications(context.env, context.env.COMPETITIONS_DB, options).catch(() => {})
  );
}

export function appealDiscordConfigured(env) {
  try {
    return Boolean(discordBotConfiguration(env));
  } catch {
    return false;
  }
}
