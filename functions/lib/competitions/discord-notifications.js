const DISCORD_TIMEOUT_MS = 5000;
const MAX_ERROR_LENGTH = 500;
const DISCORD_API_ROOT = "https://discord.com/api/v10";

function rows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function parsePayload(row) {
  let payload = {};
  try {
    const parsed = JSON.parse(row.payloadJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed;
  } catch {
    // Legacy or malformed outbox payloads are represented by an empty object.
  }
  return { ...row, payload, payloadJson: undefined };
}

function staffWebhookConfiguration(env) {
  const raw = String(env?.COMPETITIONS_DISCORD_STAFF_WEBHOOK ?? "").trim();
  if (!raw) return null;
  let webhook;
  try {
    webhook = new URL(raw);
  } catch {
    throw new Error("Competition Discord webhook URL is invalid");
  }
  if (webhook.protocol !== "https:" || !new Set(["discord.com", "discordapp.com"]).has(webhook.hostname)) {
    throw new Error("Competition Discord webhook must use Discord HTTPS");
  }
  if (!/^\/api\/webhooks\/\d{16,22}\/[A-Za-z0-9._-]{20,}$/.test(webhook.pathname)) {
    throw new Error("Competition Discord webhook path is invalid");
  }
  webhook.search = "";
  webhook.hash = "";
  webhook.searchParams.set("wait", "true");

  const roleId = String(env?.COMPETITIONS_DISCORD_STAFF_ROLE_ID ?? "").trim();
  if (roleId && !/^\d{16,22}$/.test(roleId)) throw new Error("Competition Discord staff role ID is invalid");
  return { webhook: webhook.toString(), roleId: roleId || null };
}

function contributorBotConfiguration(env) {
  const token = String(env?.COMPETITIONS_DISCORD_BOT_TOKEN ?? "").trim();
  if (!token) return null;
  if (token.length < 50 || token.length > 256 || !/^[A-Za-z0-9._-]+$/.test(token)) {
    throw new Error("Competition Discord bot token is invalid");
  }
  return { token };
}

function discordConfiguration(env) {
  return staffWebhookConfiguration(env);
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

function reviewUrl(env, notification) {
  const origin = siteOrigin(env);
  if (!origin) return null;
  const params = new URLSearchParams({
    competition: notification.competitionId,
    section: "review"
  });
  if (notification.submissionId) params.set("submission", notification.submissionId);
  return `${origin}/competitions/admin/?${params}`;
}

function contributorUrl(env, notification) {
  const origin = siteOrigin(env);
  const slug = String(notification.payload?.competitionSlug ?? "").trim().toLowerCase();
  if (!origin || !/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(slug)) return null;
  return `${origin}/competitions/detail.html?competition=${encodeURIComponent(slug)}`;
}

function webhookPayload(env, notification, config) {
  const payload = notification.payload ?? {};
  if (notification.eventType !== "SUBMISSION_REVIEW") {
    throw new Error(`Unsupported competition Discord webhook event: ${notification.eventType}`);
  }
  const url = reviewUrl(env, notification);
  const mention = config.roleId ? `<@&${config.roleId}> ` : "";
  return {
    content: `${mention}A competition submission is ready for review.`,
    allowed_mentions: config.roleId
      ? { parse: [], roles: [config.roleId] }
      : { parse: [] },
    embeds: [{
      title: String(payload.submissionTitle ?? "Competition submission").slice(0, 256),
      ...(url ? { url } : {}),
      description: `**Competition:** ${String(payload.competitionTitle ?? "Unknown").slice(0, 200)}\n**Player:** ${String(payload.ownerName ?? "Unknown").slice(0, 80)}`,
      footer: { text: "Enthusia Competition review" },
      timestamp: notification.createdAt
    }]
  };
}

function contributorMessagePayload(env, notification) {
  if (notification.eventType !== "CONTRIBUTOR_INVITE") {
    throw new Error(`Unsupported competition contributor Discord event: ${notification.eventType}`);
  }
  const payload = notification.payload ?? {};
  const role = String(payload.role ?? "contributor").replaceAll("_", " ").toLowerCase();
  const actionUrl = contributorUrl(env, notification);
  const lines = [
    `You were invited as **${role}** on **${String(payload.submissionTitle ?? "a competition entry").slice(0, 150)}**`,
    `Competition: **${String(payload.competitionTitle ?? "Enthusia Competition").slice(0, 150)}**`,
    "Accept or decline the invite from the Competition page."
  ];
  if (actionUrl) lines.push(actionUrl);
  return {
    content: lines.join("\n"),
    allowed_mentions: { parse: [] }
  };
}

async function boundedFetch(url, options, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCORD_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function listPendingCompetitionDiscordNotifications(db, nowIso, limit = 25) {
  const safeLimit = Number.isInteger(limit) ? Math.min(100, Math.max(1, limit)) : 25;
  const result = await db.prepare(`
    SELECT
      id,
      competition_id AS competitionId,
      submission_id AS submissionId,
      event_type AS eventType,
      recipient_discord_user_id AS recipientDiscordUserId,
      operation_key AS operationKey,
      payload_json AS payloadJson,
      state,
      attempts,
      next_attempt_at AS nextAttemptAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM competition_discord_outbox
    WHERE state IN ('PENDING','FAILED')
      AND next_attempt_at <= ?
    ORDER BY created_at ASC, id ASC
    LIMIT ?
  `).bind(nowIso, safeLimit).all();
  return rows(result).map(parsePayload);
}

export async function claimCompetitionDiscordNotification(db, id, claimedAt) {
  const result = await db.prepare(`
    UPDATE competition_discord_outbox
    SET state = 'DELIVERING', attempts = attempts + 1, updated_at = ?
    WHERE id = ?
      AND state IN ('PENDING','FAILED')
      AND next_attempt_at <= ?
  `).bind(claimedAt, id, claimedAt).run();
  return Number(result?.meta?.changes ?? 0) === 1;
}

export async function completeCompetitionDiscordNotification(db, id, deliveredAt) {
  await db.prepare(`
    UPDATE competition_discord_outbox
    SET state = 'DELIVERED', delivered_at = ?, updated_at = ?, last_error = NULL
    WHERE id = ? AND state = 'DELIVERING'
  `).bind(deliveredAt, deliveredAt, id).run();
}

export async function failCompetitionDiscordNotification(db, id, { failedAt, nextAttemptAt, error }) {
  await db.prepare(`
    UPDATE competition_discord_outbox
    SET state = 'FAILED', next_attempt_at = ?, last_error = ?, updated_at = ?
    WHERE id = ? AND state = 'DELIVERING'
  `).bind(nextAttemptAt, String(error ?? "discord_delivery_failed").slice(0, MAX_ERROR_LENGTH), failedAt, id).run();
}

export function discordRetryAt(failedAt, attempts) {
  const base = Date.parse(failedAt);
  if (!Number.isFinite(base)) throw new TypeError("Discord retry timestamp is invalid");
  const exponent = Math.min(8, Math.max(0, Number(attempts ?? 1) - 1));
  const delaySeconds = Math.min(3600, 15 * (2 ** exponent));
  return new Date(base + delaySeconds * 1000).toISOString();
}

export async function recoverStaleCompetitionDiscordNotifications(db, nowIso, leaseSeconds = 300) {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) throw new TypeError("Discord recovery timestamp is invalid");
  const lease = Number.isInteger(leaseSeconds) ? Math.max(60, Math.min(3600, leaseSeconds)) : 300;
  const staleBefore = new Date(now - lease * 1000).toISOString();
  const result = await db.prepare(`
    UPDATE competition_discord_outbox
    SET state = 'FAILED',
        next_attempt_at = ?,
        last_error = COALESCE(last_error, 'delivery_lease_expired'),
        updated_at = ?
    WHERE state = 'DELIVERING'
      AND updated_at <= ?
  `).bind(nowIso, nowIso, staleBefore).run();
  return Number(result?.meta?.changes ?? 0);
}

async function deliverStaffWebhook(env, notification, fetchImpl) {
  const config = staffWebhookConfiguration(env);
  if (!config) return { status: "NOT_CONFIGURED" };
  const response = await boundedFetch(config.webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(webhookPayload(env, notification, config))
  }, fetchImpl);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Competition Discord webhook failed: ${response.status}:${body?.message ?? "unknown"}`);
  }
  return { status: "DELIVERED", messageId: body?.id ?? null };
}

async function deliverContributorDm(env, notification, fetchImpl) {
  const config = contributorBotConfiguration(env);
  if (!config) return { status: "NOT_CONFIGURED" };
  const recipient = String(notification.recipientDiscordUserId ?? "").trim();
  if (!/^\d{16,22}$/.test(recipient)) throw new Error("Competition contributor Discord recipient is invalid");

  const auth = { authorization: `Bot ${config.token}`, "content-type": "application/json" };
  const channelResponse = await boundedFetch(`${DISCORD_API_ROOT}/users/@me/channels`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ recipient_id: recipient })
  }, fetchImpl);
  const channel = await channelResponse.json().catch(() => null);
  if (!channelResponse.ok || !/^\d{16,22}$/.test(String(channel?.id ?? ""))) {
    throw new Error(`Competition contributor DM channel failed: ${channelResponse.status}:${channel?.message ?? "unknown"}`);
  }

  const messageResponse = await boundedFetch(`${DISCORD_API_ROOT}/channels/${channel.id}/messages`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify(contributorMessagePayload(env, notification))
  }, fetchImpl);
  const message = await messageResponse.json().catch(() => null);
  if (!messageResponse.ok) {
    throw new Error(`Competition contributor DM failed: ${messageResponse.status}:${message?.message ?? "unknown"}`);
  }
  return { status: "DELIVERED", messageId: message?.id ?? null };
}

export async function deliverCompetitionDiscordNotification(env, notification, fetchImpl = fetch) {
  if (notification.eventType === "SUBMISSION_REVIEW") {
    return deliverStaffWebhook(env, notification, fetchImpl);
  }
  if (notification.eventType === "CONTRIBUTOR_INVITE") {
    return deliverContributorDm(env, notification, fetchImpl);
  }
  throw new Error(`Unsupported competition Discord event: ${notification.eventType}`);
}

function eventConfigured(env, eventType) {
  try {
    if (eventType === "SUBMISSION_REVIEW") return Boolean(staffWebhookConfiguration(env));
    if (eventType === "CONTRIBUTOR_INVITE") return Boolean(contributorBotConfiguration(env));
    return false;
  } catch {
    return false;
  }
}

export async function drainCompetitionDiscordNotifications(env, db, { limit = 25, fetchImpl = fetch } = {}) {
  const now = new Date().toISOString();
  const pending = await listPendingCompetitionDiscordNotifications(db, now, limit);
  const outcomes = [];
  for (const notification of pending) {
    if (!eventConfigured(env, notification.eventType)) continue;
    const claimedAt = new Date().toISOString();
    if (!await claimCompetitionDiscordNotification(db, notification.id, claimedAt)) continue;
    try {
      const delivery = await deliverCompetitionDiscordNotification(env, notification, fetchImpl);
      if (delivery.status === "NOT_CONFIGURED") continue;
      const deliveredAt = new Date().toISOString();
      await completeCompetitionDiscordNotification(db, notification.id, deliveredAt);
      outcomes.push({ id: notification.id, status: delivery.status });
    } catch (error) {
      const failedAt = new Date().toISOString();
      await failCompetitionDiscordNotification(db, notification.id, {
        failedAt,
        nextAttemptAt: discordRetryAt(failedAt, Number(notification.attempts ?? 0) + 1),
        error: String(error?.message ?? error)
      });
      outcomes.push({ id: notification.id, status: "FAILED" });
    }
  }
  return outcomes;
}

export function scheduleCompetitionDiscordDrain(context, options = {}) {
  if (!context?.waitUntil || !context?.env?.COMPETITIONS_DB) return;
  context.waitUntil(
    drainCompetitionDiscordNotifications(context.env, context.env.COMPETITIONS_DB, options).catch(() => {})
  );
}

export function competitionDiscordConfigured(env) {
  try {
    return Boolean(staffWebhookConfiguration(env));
  } catch {
    return false;
  }
}

export function competitionContributorDiscordConfigured(env) {
  try {
    return Boolean(contributorBotConfiguration(env));
  } catch {
    return false;
  }
}

export {
  contributorBotConfiguration,
  contributorMessagePayload,
  contributorUrl,
  discordConfiguration,
  reviewUrl,
  staffWebhookConfiguration,
  webhookPayload
};
