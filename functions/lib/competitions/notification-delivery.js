import { signedCompetitionBridgeRequest } from "./bridge.js";
import {
  claimCompetitionNotification,
  completeCompetitionNotification,
  failCompetitionNotification,
  listPendingCompetitionNotifications,
  markCompetitionNotificationChannelDelivered,
  notificationRetryAt
} from "./notifications.js";

function siteOrigin(env) {
  const raw = String(env?.COMPETITIONS_SITE_ORIGIN ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function entrantActionUrl(env, notification) {
  const origin = siteOrigin(env);
  const slug = String(notification.payload?.competitionSlug ?? "").trim().toLowerCase();
  if (!origin || !/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(slug)) return "";
  return `${origin}/competitions/detail.html?competition=${encodeURIComponent(slug)}`;
}

function staffReviewUrl(env, notification) {
  const origin = siteOrigin(env);
  if (!origin) return "";
  const params = new URLSearchParams({ competition: notification.competitionId, section: "review" });
  if (notification.submissionId) params.set("submission", notification.submissionId);
  return `${origin}/competitions/admin/?${params}`;
}

function contributorPayload(env, notification, action) {
  const payload = notification.payload ?? {};
  return {
    action,
    competitionId: notification.competitionId,
    submissionId: notification.submissionId,
    playerUuid: notification.recipientUuid ?? payload.playerUuid,
    ...(action === "UPSERT" ? {
      competitionTitle: payload.competitionTitle,
      submissionTitle: payload.submissionTitle,
      role: payload.role,
      actionUrl: payload.actionUrl ?? entrantActionUrl(env, notification)
    } : {})
  };
}

function discordWebhookUrl(env) {
  const raw = String(env?.COMPETITION_STAFF_DISCORD_WEBHOOK_URL ?? "").trim();
  if (!raw) throw new Error("competition_discord_webhook_not_configured");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("competition_discord_webhook_invalid");
  }
  if (url.protocol !== "https:" || url.hostname !== "discord.com" || !/^\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+\/?$/.test(url.pathname)) {
    throw new Error("competition_discord_webhook_invalid");
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

function discordRoleId(env) {
  const value = String(env?.COMPETITION_STAFF_DISCORD_ROLE_ID ?? "").trim();
  return /^\d{5,30}$/.test(value) ? value : null;
}

function discordSubmissionReviewPayload(env, notification) {
  const reviewUrl = notification.payload?.reviewUrl ?? staffReviewUrl(env, notification);
  const roleId = discordRoleId(env);
  const competitionTitle = String(notification.payload?.competitionTitle ?? "Competition").slice(0, 256);
  const submissionTitle = String(notification.payload?.submissionTitle ?? "New submission").slice(0, 256);
  const ownerName = String(notification.payload?.ownerName ?? "Unknown player").slice(0, 256);
  return {
    ...(roleId ? { content: `<@&${roleId}> new competition submission requires review.` } : {}),
    allowed_mentions: roleId ? { parse: [], roles: [roleId] } : { parse: [] },
    embeds: [{
      title: "Competition submission ready for review",
      description: `**${submissionTitle}**\nSubmitted by ${ownerName}`,
      fields: [{ name: "Competition", value: competitionTitle, inline: true }],
      ...(reviewUrl ? { url: reviewUrl } : {}),
      timestamp: new Date().toISOString()
    }]
  };
}

function needsBridge(notification) {
  return new Set([
    "CONTRIBUTOR_INVITE",
    "CONTRIBUTOR_RESPONSE",
    "CONTRIBUTOR_REMOVED",
    "SUBMISSION_REVIEW"
  ]).has(notification.eventType);
}

function needsDiscord(notification) {
  return notification.eventType === "SUBMISSION_REVIEW";
}

export async function deliverCompetitionNotification(env, notification) {
  let path;
  let body;
  if (notification.eventType === "CONTRIBUTOR_INVITE") {
    path = "/v1/competitions/notifications/contributor";
    body = contributorPayload(env, notification, "UPSERT");
  } else if (
    notification.eventType === "CONTRIBUTOR_RESPONSE"
    || notification.eventType === "CONTRIBUTOR_REMOVED"
  ) {
    path = "/v1/competitions/notifications/contributor";
    body = contributorPayload(env, notification, "CLEAR");
  } else if (notification.eventType === "SUBMISSION_REVIEW") {
    path = "/v1/competitions/notifications/submission";
    body = {
      competitionTitle: notification.payload?.competitionTitle,
      submissionTitle: notification.payload?.submissionTitle,
      ownerName: notification.payload?.ownerName,
      reviewUrl: notification.payload?.reviewUrl ?? staffReviewUrl(env, notification)
    };
  } else {
    throw new Error(`Unsupported competition notification event: ${notification.eventType}`);
  }

  const response = await signedCompetitionBridgeRequest(env, path, body);
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Competition notification bridge failed: ${response.status}:${responseBody?.error ?? "unknown"}`);
  }
  if (!responseBody || typeof responseBody.status !== "string") {
    throw new Error("Competition notification bridge returned an invalid response");
  }
  return responseBody;
}

export async function deliverCompetitionDiscordNotification(env, notification, fetchImpl = fetch) {
  if (notification.eventType !== "SUBMISSION_REVIEW") {
    throw new Error(`Unsupported Discord competition notification event: ${notification.eventType}`);
  }
  const response = await fetchImpl(discordWebhookUrl(env), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(discordSubmissionReviewPayload(env, notification))
  });
  if (!response.ok) throw new Error(`Competition Discord webhook failed: ${response.status}`);
  return { status: "DELIVERED" };
}

export async function drainCompetitionNotifications(env, db, { limit = 25, discordFetch = fetch } = {}) {
  const now = new Date().toISOString();
  const pending = await listPendingCompetitionNotifications(db, now, limit);
  const outcomes = [];
  for (const notification of pending) {
    const claimedAt = new Date().toISOString();
    const claimed = await claimCompetitionNotification(db, notification.id, claimedAt);
    if (!claimed) continue;
    try {
      if (needsBridge(notification) && !notification.bridgeDeliveredAt) {
        await deliverCompetitionNotification(env, notification);
        await markCompetitionNotificationChannelDelivered(db, notification.id, "bridge", new Date().toISOString());
      }
      if (needsDiscord(notification) && !notification.discordDeliveredAt) {
        await deliverCompetitionDiscordNotification(env, notification, discordFetch);
        await markCompetitionNotificationChannelDelivered(db, notification.id, "discord", new Date().toISOString());
      }
      const deliveredAt = new Date().toISOString();
      await completeCompetitionNotification(db, notification.id, deliveredAt);
      outcomes.push({ id: notification.id, status: "DELIVERED" });
    } catch (error) {
      const failedAt = new Date().toISOString();
      await failCompetitionNotification(db, notification.id, {
        failedAt,
        nextAttemptAt: notificationRetryAt(failedAt, Number(notification.attempts ?? 0) + 1),
        error: String(error?.message ?? error)
      });
      outcomes.push({ id: notification.id, status: "FAILED" });
    }
  }
  return outcomes;
}

export function scheduleCompetitionNotificationDrain(context, options = {}) {
  if (!context?.waitUntil || !context?.env?.COMPETITIONS_DB) return;
  context.waitUntil(
    drainCompetitionNotifications(context.env, context.env.COMPETITIONS_DB, options)
      .catch(() => {})
  );
}

export {
  discordRoleId,
  discordSubmissionReviewPayload,
  discordWebhookUrl,
  entrantActionUrl,
  needsBridge,
  needsDiscord,
  staffReviewUrl
};
