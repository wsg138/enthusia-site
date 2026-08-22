import { authenticateRequest } from "../../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase
} from "../../../lib/competitions/access.js";
import {
  sanitizeCompetitionConfig,
  sanitizeDraftCompetition
} from "../../../lib/competitions/config.js";
import {
  getAdminCompetition,
  saveDraftCompetition
} from "../../../lib/competitions/drafts.js";
import { validatePublishableCompetitionConfig } from "../../../lib/competitions/lifecycle.js";
import { json, methodNotAllowed, unauthorized } from "../../../lib/responses.js";
import { requireSameOrigin } from "../../../lib/security.js";
import { isCanonicalUuid } from "../../../lib/validation.js";
import { sanitizeCompetitionVisibility } from "../../../lib/competitions/visibility.js";

function competitionId(context) {
  const value = typeof context?.params?.id === "string" ? context.params.id.trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
}

async function authorizeManager(context) {
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

function changeNote(value) {
  if (value === null || value === undefined || value === "") return "Draft updated";
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 500 ? normalized : null;
}

export async function onRequestGet(context) {
  const id = competitionId(context);
  if (!id) return json({ error: "competition_not_found" }, 404);

  const authorized = await authorizeManager(context);
  if (authorized.response) return authorized.response;

  try {
    const competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
    if (!competition) return json({ error: "competition_not_found" }, 404);
    return json({
      competition,
      publishReadiness: validatePublishableCompetitionConfig(competition.config)
    });
  } catch {
    return json({ error: "competition_database_unavailable" }, 503);
  }
}

export async function onRequestPatch(context) {
  if (!requireSameOrigin(context.request)) {
    return json({ error: "invalid_origin" }, 403);
  }

  const id = competitionId(context);
  if (!id) return json({ error: "competition_not_found" }, 404);

  const authorized = await authorizeManager(context);
  if (authorized.response) return authorized.response;

  let input;
  try {
    input = await context.request.json();
  } catch {
    input = null;
  }

  if (!input || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    return json({ error: "expected_version_required" }, 400);
  }

  const note = changeNote(input.changeNote);
  const config = sanitizeCompetitionConfig(input.config);
  if (!note || !config) {
    return json({ error: "invalid_competition_draft" }, 400);
  }

  let current;
  try {
    current = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
  } catch {
    return json({ error: "competition_database_unavailable" }, 503);
  }
  if (!current) return json({ error: "competition_not_found" }, 404);
  if (current.lifecycleState !== "DRAFT") {
    return json({ error: "competition_not_editable_as_draft" }, 409);
  }
  if (current.configVersion !== input.expectedVersion) {
    return json({ error: "competition_version_conflict", currentVersion: current.configVersion }, 409);
  }

  const visibility = sanitizeCompetitionVisibility(input.visibility, current.visibility);
  if (!visibility) return json({ error: "invalid_competition_draft" }, 400);

  const basics = sanitizeDraftCompetition({
    title: input.title,
    category: input.category,
    summary: config.public.summary,
    slug: current.slug
  });
  if (!basics) return json({ error: "invalid_competition_draft" }, 400);

  const now = new Date().toISOString();
  try {
    const result = await saveDraftCompetition(context.env.COMPETITIONS_DB, {
      competitionId: id,
      expectedVersion: input.expectedVersion,
      operationId: crypto.randomUUID(),
      auditEventId: crypto.randomUUID(),
      title: basics.title,
      category: basics.category,
      visibility,
      beforeTitle: current.title,
      beforeCategory: current.category,
      beforeVisibility: current.visibility,
      config,
      actorSubject: authorized.session.subject,
      actorUuid: authorized.session.player.uuid,
      createdAt: now,
      changeNote: note
    });

    if (result.status !== "UPDATED") {
      return json({ error: "competition_version_conflict" }, 409);
    }

    return json({
      competition: {
        ...result.competition,
        slug: current.slug
      },
      publishReadiness: validatePublishableCompetitionConfig(config)
    });
  } catch (error) {
    const message = String(error?.message ?? error);
    if (message.includes("stale_competition_config_version") || message.includes("UNIQUE constraint")) {
      return json({ error: "competition_version_conflict" }, 409);
    }
    return json({ error: "competition_update_failed" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET", "PATCH"]);
}
