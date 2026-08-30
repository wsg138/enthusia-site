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

function publicationInput(value) {
  if (!value || typeof value !== "object") return null;
  const operationId = typeof value.idempotencyKey === "string"
    ? value.idempotencyKey.trim().toLowerCase()
    : "";
  const publishNote = note(value.note);
  return isCanonicalUuid(operationId) && publishNote
    ? { operationId, publishNote }
    : null;
}

async function readPublicationInput(request) {
  try {
    return publicationInput(await request.json());
  } catch {
    return null;
  }
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

async function validatedRequest(context) {
  if (!requireSameOrigin(context.request)) return { response: json({ error: "invalid_origin" }, 403) };
  const id = competitionId(context);
  if (!id) return { response: json({ error: "competition_not_found" }, 404) };
  const authorized = await authorizeManager(context);
  if (authorized.response) return authorized;
  const input = await readPublicationInput(context.request);
  if (!input) return { response: json({ error: "invalid_results_publish_request" }, 400) };
  return { id, session: authorized.session, input };
}

async function loadCompetition(db, id) {
  try {
    const competition = await getAdminCompetition(db, id);
    return competition
      ? { competition }
      : { response: json({ error: "competition_not_found" }, 404) };
  } catch {
    return { response: json({ error: "competition_database_unavailable" }, 503) };
  }
}

function publicationStateResponse(current, operationId) {
  if (current.lifecycleState === "COMPLETED" && current.lastLifecycleOperationId === operationId) {
    return json({ competition: current, idempotentReplay: true });
  }
  if (current.lifecycleState !== "RESULTS_READY") {
    return json({
      error: "competition_state_conflict",
      currentState: current.lifecycleState
    }, 409);
  }
  return null;
}

async function applyPublication(db, request) {
  const publishedAt = new Date().toISOString();
  const result = await publishProvisionalResults(db, {
    competitionId: request.id,
    operationId: request.input.operationId,
    auditEventId: crypto.randomUUID(),
    actorSubject: request.session.subject,
    actorUuid: request.session.player.uuid,
    note: request.input.publishNote,
    publishedAt
  });
  if (result.status === "NOT_READY") {
    return json({ error: "competition_results_not_ready", readiness: result.readiness }, 409);
  }
  if (result.status !== "PUBLISHED") {
    return json({ error: "competition_results_publish_conflict" }, 409);
  }
  const competition = await getAdminCompetition(db, request.id);
  return json({
    competition,
    resultCount: result.resultCount,
    configVersion: result.configVersion,
    publishedAt: result.publishedAt,
    idempotentReplay: false
  });
}

function publicationFailureResponse(error) {
  const message = String(error?.message ?? error);
  const conflict = message.includes("competition_results_")
    || message.includes("UNIQUE constraint")
    || message.includes("stale_competition_config_version");
  return conflict
    ? json({ error: "competition_results_publish_conflict" }, 409)
    : json({ error: "competition_results_publish_failed" }, 503);
}

export async function onRequestPost(context) {
  const request = await validatedRequest(context);
  if (request.response) return request.response;
  const database = context.env.COMPETITIONS_DB;
  const loaded = await loadCompetition(database, request.id);
  if (loaded.response) return loaded.response;
  const stateResponse = publicationStateResponse(loaded.competition, request.input.operationId);
  if (stateResponse) return stateResponse;

  try {
    return await applyPublication(database, request);
  } catch (error) {
    return publicationFailureResponse(error);
  }
}

export function onRequest() {
  return methodNotAllowed(["POST"]);
}

export { note, publicationFailureResponse, publicationInput, publicationStateResponse };
