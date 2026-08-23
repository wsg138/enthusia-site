import { authenticateRequest } from "../../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase,
  hasCompetitionMedia
} from "../../../lib/competitions/access.js";
import { competitionBridgeConfiguration } from "../../../lib/competitions/bridge.js";
import { competitionDiscordConfigured } from "../../../lib/competitions/discord-notifications.js";
import { discordOAuthConfigured } from "../../../lib/competitions/discord-oauth.js";
import { moderationModel } from "../../../lib/competitions/moderation.js";
import { competitionSchemaReady } from "../../../lib/competitions/repository.js";
import { json, methodNotAllowed, unauthorized } from "../../../lib/responses.js";

function bridgeConfigured(env) {
  try {
    competitionBridgeConfiguration(env);
    return true;
  } catch {
    return false;
  }
}

function siteOriginConfigured(env) {
  const raw = String(env?.COMPETITIONS_SITE_ORIGIN ?? "").trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

export function buildStatusSnapshot(env, schemaReady) {
  const featureEnabled = competitionsEnabled(env);
  const databaseBound = hasCompetitionDatabase(env);
  const mediaBound = hasCompetitionMedia(env);
  const moderationConfigured = typeof env?.OPENAI_API_KEY === "string" && Boolean(env.OPENAI_API_KEY.trim());
  const oauthConfigured = discordOAuthConfigured(env);
  const bridgeReady = bridgeConfigured(env);
  const discordStaffReady = competitionDiscordConfigured(env);
  const originReady = siteOriginConfigured(env);
  return {
    ok: Boolean(
      featureEnabled
      && schemaReady
      && mediaBound
      && moderationConfigured
      && oauthConfigured
      && bridgeReady
      && discordStaffReady
      && originReady
    ),
    environment: String(env?.APP_ENV ?? "unknown"),
    featureEnabled,
    database: {
      bound: databaseBound,
      schemaReady: Boolean(schemaReady)
    },
    media: {
      bound: mediaBound
    },
    moderation: {
      configured: moderationConfigured,
      model: moderationModel(env)
    },
    identity: {
      discordOAuthConfigured: oauthConfigured
    },
    bridge: {
      configured: bridgeReady
    },
    notifications: {
      minecraftConfigured: bridgeReady,
      discordStaffConfigured: discordStaffReady
    },
    siteOrigin: {
      configured: originReady
    }
  };
}

export async function onRequestGet(context) {
  if (!competitionsEnabled(context.env)) {
    return json({ error: "not_found" }, 404);
  }

  let session;
  try {
    session = await authenticateRequest(context.request, context.env);
  } catch {
    return unauthorized();
  }

  if (!canManageCompetitions(session, context.env)) {
    return json({ error: "competition_manager_required" }, 403);
  }

  if (!hasCompetitionDatabase(context.env)) {
    return json({ error: "competition_database_unavailable" }, 503);
  }

  let schemaReady = false;
  try {
    schemaReady = await competitionSchemaReady(context.env.COMPETITIONS_DB);
  } catch {
    return json({ error: "competition_database_unavailable" }, 503);
  }

  const snapshot = buildStatusSnapshot(context.env, schemaReady);
  return json(snapshot, snapshot.ok ? 200 : 503);
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}

export { bridgeConfigured, siteOriginConfigured };
