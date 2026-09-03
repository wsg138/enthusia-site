import { authenticateRequest } from "../../../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase
} from "../../../../lib/competitions/access.js";
import { getAdminCompetition } from "../../../../lib/competitions/drafts.js";
import {
  canTransitionCompetition,
  isCompetitionState,
  validatePublishableCompetitionConfig
} from "../../../../lib/competitions/lifecycle.js";
import { materializeCompetitionRewards } from "../../../../lib/competitions/reward-config.js";
import { transitionCompetitionState } from "../../../../lib/competitions/state.js";
import { json, methodNotAllowed, unauthorized } from "../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../lib/validation.js";

function competitionId(context) {
  const value = typeof context?.params?.id === "string" ? context.params.id.trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
}

function note(value, targetState) {
  if (value === null || value === undefined || value === "") return `State changed to ${targetState}`;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 500 ? normalized : null;
}

function lifecycleInput(value) {
  if (!value || typeof value !== "object") return null;
  const expectedState = value.expectedState;
  const targetState = value.targetState;
  const operationId = typeof value.idempotencyKey === "string"
    ? value.idempotencyKey.trim().toLowerCase()
    : "";
  const changeNote = note(value.note, targetState);
  if (!isCompetitionState(expectedState) || !isCompetitionState(targetState) || !isCanonicalUuid(operationId) || !changeNote) {
    return null;
  }
  return { expectedState, targetState, operationId, changeNote };
}

async function readLifecycleInput(request) {
  try {
    return lifecycleInput(await request.json());
  } catch {
    return null;
  }
}

function publicationTransition(input) {
  return input.expectedState === "DRAFT" && input.targetState === "UPCOMING";
}

function requiresResultsEndpoint(input) {
  return input.expectedState === "RESULTS_READY" && input.targetState === "COMPLETED";
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
  const input = await readLifecycleInput(context.request);
  if (!input) return { response: json({ error: "invalid_lifecycle_request" }, 400) };
  if (requiresResultsEndpoint(input)) {
    return { response: json({ error: "competition_results_publish_endpoint_required" }, 409) };
  }
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

function transitionValidation(current, input) {
  if (current.lastLifecycleOperationId === input.operationId && current.lifecycleState === input.targetState) {
    return json({
      competition: current,
      idempotentReplay: true
    });
  }
  if (current.lifecycleState !== input.expectedState) {
    return json({
      error: "competition_state_conflict",
      currentState: current.lifecycleState
    }, 409);
  }
  if (!canTransitionCompetition(input.expectedState, input.targetState)) {
    return json({ error: "competition_transition_not_allowed" }, 409);
  }
  if (!publicationTransition(input)) return null;
  const readiness = validatePublishableCompetitionConfig(current.config);
  return readiness.length
    ? json({ error: "competition_not_publishable", publishReadiness: readiness }, 409)
    : null;
}

function preparedTransition(id, current, input) {
  const response = transitionValidation(current, input);
  if (response) return { response };
  const createdAt = new Date().toISOString();
  if (!publicationTransition(input)) return { createdAt, rewardDefinitions: undefined };
  try {
    const rewardDefinitions = materializeCompetitionRewards({
      competitionId: id,
      configVersion: current.configVersion,
      rewards: current.config.rewards,
      createdAt
    });
    return { createdAt, rewardDefinitions };
  } catch {
    return { response: json({ error: "competition_rewards_invalid" }, 409) };
  }
}

async function applyTransition(db, request, prepared) {
  const result = await transitionCompetitionState(db, {
    competitionId: request.id,
    expectedState: request.input.expectedState,
    targetState: request.input.targetState,
    operationId: request.input.operationId,
    auditEventId: crypto.randomUUID(),
    actorSubject: request.session.subject,
    actorUuid: request.session.player.uuid,
    note: request.input.changeNote,
    createdAt: prepared.createdAt,
    ...(prepared.rewardDefinitions ? { rewardDefinitions: prepared.rewardDefinitions } : {})
  });
  if (result.status !== "UPDATED") {
    return json({ error: "competition_state_conflict" }, 409);
  }
  const competition = await getAdminCompetition(db, request.id);
  return json({ competition, idempotentReplay: false });
}

async function transitionFailureResponse(db, request, error) {
  const message = String(error?.message ?? error);
  if (!message.includes("UNIQUE constraint")) {
    return json({ error: "competition_state_update_failed" }, 503);
  }
  const competition = await getAdminCompetition(db, request.id).catch(() => null);
  if (competition?.lastLifecycleOperationId === request.input.operationId && competition.lifecycleState === request.input.targetState) {
    return json({ competition, idempotentReplay: true });
  }
  return json({ error: "competition_state_conflict" }, 409);
}

export async function onRequestPost(context) {
  const request = await validatedRequest(context);
  if (request.response) return request.response;
  const database = context.env.COMPETITIONS_DB;
  const loaded = await loadCompetition(database, request.id);
  if (loaded.response) return loaded.response;
  const prepared = preparedTransition(request.id, loaded.competition, request.input);
  if (prepared.response) return prepared.response;

  try {
    return await applyTransition(database, request, prepared);
  } catch (error) {
    return transitionFailureResponse(database, request, error);
  }
}

export function onRequest() {
  return methodNotAllowed(["POST"]);
}

export { lifecycleInput, note, publicationTransition, transitionValidation };
