import { competitionBridgeConfiguration } from "../../lib/competitions/bridge.js";
import {
  competitionDiscordConfigured,
  drainCompetitionDiscordNotifications
} from "../../lib/competitions/discord-notifications.js";
import { drainCompetitionNotifications } from "../../lib/competitions/notification-delivery.js";

export function competitionNotificationDeliveryReady(env) {
  if (!env?.COMPETITIONS_DB) return false;
  try {
    competitionBridgeConfiguration(env);
    return true;
  } catch {
    return false;
  }
}

export async function onRequest(context) {
  const response = await context.next();
  if (typeof context.waitUntil !== "function" || !context.env?.COMPETITIONS_DB) return response;

  if (competitionNotificationDeliveryReady(context.env)) {
    context.waitUntil(
      drainCompetitionNotifications(context.env, context.env.COMPETITIONS_DB, { limit: 25 })
        .catch(() => {})
    );
  }
  if (competitionDiscordConfigured(context.env)) {
    context.waitUntil(
      drainCompetitionDiscordNotifications(context.env, context.env.COMPETITIONS_DB, { limit: 25 })
        .catch(() => {})
    );
  }
  return response;
}
