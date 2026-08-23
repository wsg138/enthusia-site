import { authenticateRequest } from "../../../../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase
} from "../../../../../lib/competitions/access.js";
import { getAdminCompetition } from "../../../../../lib/competitions/drafts.js";
import { publishProvisionalResults } from "../../../../../lib/competitions/results.js";
import { json, methodNotAllowed, unauthorized } from "../../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../../lib/validation.js";

function competitionId(context) {
  const value = typeof context?.params?.id === "string" ? context.params.id.trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
}

function note(value) {
  if (value === null || value === undefined || value === "") return "Final competition results published";
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 500 ? normalized : null;
}

async function authorizeManager(context) {
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
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

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);

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

  const operationId = typeof input?.idempotencyKey === "string"
    ? input.idempotencyKey.trim().toLowerCase()
    : "";
  const publishNote = note(input?.note);
  if (!isCanonicalUuid(operationId) || !publishNote) {
    return json({ error: "invalid_results_publish_request" }, 400);
  }

  let current;
  try {
    current = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
  } catch {
    return json({ error: "competition_database_unavailable" }, 503);
  }
  if (!current) return json({ error: "competition_not_found" }, 404);

  if (current.lifecycleState === "COMPLETED" && current.lastLifecycleOperationId === operationId) {
    return json({ competition: current, idempotentReplay: true });
  }
  if (current.lifecycleState !== "RESULTS_READY") {
    return json({
      error: "competition_state_conflict",
      currentState: current.lifecycleState
    }, 409);
  }

  const publishedAt = new Date().toISOString();
  try {
    const result = await publishProvisionalResults(context.env.COMPETITIONS_DB, {
      competitionId: id,
      operationId,
      auditEventId: crypto.randomUUID(),
      actorSubject: authorized.session.subject,
      actorUuid: authorized.session.player.uuid,
      note: publishNote,
      publishedAt
    });

    if (result.status === "NOT_READY") {
      return json({
        error: "competition_results_not_ready",
        readiness: result.readiness
      }, 409);
    }
    if (result.status !== "PUBLISHED") {
      return json({ error: "competition_results_publish_conflict" }, 409);
    }

    const competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
    return json({
      competition,
      resultCount: result.resultCount,
      configVersion: result.configVersion,
      publishedAt: result.publishedAt,
      idempotentReplay: false
    });
  } catch (error) {
    const message = String(error?.message ?? error);
    if (
      message.includes("competition_results_")
      || message.includes("UNIQUE constraint")
      || message.includes("stale_competition_config_version")
    ) {
      return json({ error: "competition_results_publish_conflict" }, 409);
    }
    return json({ error: "competition_results_publish_failed" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["POST"]);
}
