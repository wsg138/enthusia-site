import { authenticateRequest } from "../../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase,
  hasCompetitionMedia
} from "../../../lib/competitions/access.js";
import { moderationModel } from "../../../lib/competitions/moderation.js";
import { competitionSchemaReady } from "../../../lib/competitions/repository.js";
import { json, methodNotAllowed, unauthorized } from "../../../lib/responses.js";

export function buildStatusSnapshot(env, schemaReady) {
  return {
    ok: Boolean(schemaReady),
    environment: String(env?.APP_ENV ?? "unknown"),
    featureEnabled: competitionsEnabled(env),
    database: {
      bound: hasCompetitionDatabase(env),
      schemaReady: Boolean(schemaReady)
    },
    media: {
      bound: hasCompetitionMedia(env)
    },
    moderation: {
      configured: typeof env?.OPENAI_API_KEY === "string" && Boolean(env.OPENAI_API_KEY.trim()),
      model: moderationModel(env)
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
  return json(snapshot, schemaReady ? 200 : 503);
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}
