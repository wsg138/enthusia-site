import { signedCompetitionBridgeRequest } from "./bridge.js";
import {
  claimCompetitionNotification,
  completeCompetitionNotification,
  failCompetitionNotification,
  listPendingCompetitionNotifications,
  notificationRetryAt
} from "./notifications.js";

function contributorPayload(notification, action) {
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
      actionUrl: payload.actionUrl ?? ""
    } : {})
  };
}

export async function deliverCompetitionNotification(env, notification) {
  let path;
  let body;
  if (notification.eventType === "CONTRIBUTOR_INVITE") {
    path = "/v1/competitions/notifications/contributor";
    body = contributorPayload(notification, "UPSERT");
  } else if (
    notification.eventType === "CONTRIBUTOR_RESPONSE"
    || notification.eventType === "CONTRIBUTOR_REMOVED"
  ) {
    path = "/v1/competitions/notifications/contributor";
    body = contributorPayload(notification, "CLEAR");
  } else if (notification.eventType === "SUBMISSION_REVIEW") {
    path = "/v1/competitions/notifications/submission";
    body = {
      competitionTitle: notification.payload?.competitionTitle,
      submissionTitle: notification.payload?.submissionTitle,
      ownerName: notification.payload?.ownerName,
      reviewUrl: notification.payload?.reviewUrl ?? ""
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

export async function drainCompetitionNotifications(env, db, { limit = 25 } = {}) {
  const now = new Date().toISOString();
  const pending = await listPendingCompetitionNotifications(db, now, limit);
  const outcomes = [];
  for (const notification of pending) {
    const claimedAt = new Date().toISOString();
    const claimed = await claimCompetitionNotification(db, notification.id, claimedAt);
    if (!claimed) continue;
    try {
      await deliverCompetitionNotification(env, notification);
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
