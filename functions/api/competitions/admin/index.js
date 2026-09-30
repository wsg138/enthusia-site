import { authenticateRequest } from "../../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase
} from "../../../lib/competitions/access.js";
import {
  initialCompetitionConfig,
  sanitizeDraftCompetition
} from "../../../lib/competitions/config.js";
import {
  competitionSlugExists,
  createDraftCompetition,
  listAdminCompetitions
} from "../../../lib/competitions/repository.js";
import { json, methodNotAllowed, unauthorized } from "../../../lib/responses.js";
import { requireSameOrigin } from "../../../lib/security.js";

async function managerSession(context) {
  if (!competitionsEnabled(context.env)) {
    return { response: json({ error: "not_found" }, 404) };
  }

  let session;
  try {
    session = await authenticateRequest(context.request, context.env);
  } catch {
    return { response: unauthorized() };
  }

  if (!canManageCompetitions(session, context.env)) {
    return { response: json({ error: "competition_manager_required" }, 403) };
  }

  if (!hasCompetitionDatabase(context.env)) {
    return { response: json({ error: "competition_database_unavailable" }, 503) };
  }

  return { session };
}

export async function onRequestGet(context) {
  const authorized = await managerSession(context);
  if (authorized.response) return authorized.response;

  try {
    const competitions = await listAdminCompetitions(context.env.COMPETITIONS_DB);
    return json({ competitions });
  } catch {
    return json({ error: "competition_database_unavailable" }, 503);
  }
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) {
    return json({ error: "invalid_origin" }, 403);
  }

  const authorized = await managerSession(context);
  if (authorized.response) return authorized.response;

  let input;
  try {
    input = await context.request.json();
  } catch {
    input = null;
  }

  const sanitized = sanitizeDraftCompetition(input);
  if (!sanitized) {
    return json({ error: "invalid_competition_draft" }, 400);
  }

  try {
    if (await competitionSlugExists(context.env.COMPETITIONS_DB, sanitized.slug)) {
      return json({ error: "competition_slug_exists" }, 409);
    }

    const now = new Date().toISOString();
    const draft = {
      id: crypto.randomUUID(),
      auditEventId: crypto.randomUUID(),
      ...sanitized,
      config: initialCompetitionConfig({ summary: sanitized.summary }),
      createdBySubject: authorized.session.subject,
      createdByUuid: authorized.session.player.uuid,
      createdAt: now
    };

    const competition = await createDraftCompetition(context.env.COMPETITIONS_DB, draft);
    return json({ competition }, 201);
  } catch {
    return json({ error: "competition_create_failed" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET", "POST"]);
}
