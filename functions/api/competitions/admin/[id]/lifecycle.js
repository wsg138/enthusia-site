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

  const expectedState = input?.expectedState;
  const targetState = input?.targetState;
  const operationId = typeof input?.idempotencyKey === "string"
    ? input.idempotencyKey.trim().toLowerCase()
    : "";
  const changeNote = note(input?.note, targetState);

  if (
    !isCompetitionState(expectedState)
    || !isCompetitionState(targetState)
    || !isCanonicalUuid(operationId)
    || !changeNote
  ) {
    return json({ error: "invalid_lifecycle_request" }, 400);
  }

  if (expectedState === "RESULTS_READY" && targetState === "COMPLETED") {
    return json({ error: "competition_results_publish_endpoint_required" }, 409);
  }

  let current;
  try {
    current = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
  } catch {
    return json({ error: "competition_database_unavailable" }, 503);
  }
  if (!current) return json({ error: "competition_not_found" }, 404);

  if (current.lastLifecycleOperationId === operationId && current.lifecycleState === targetState) {
    return json({
      competition: current,
      idempotentReplay: true
    });
  }

  if (current.lifecycleState !== expectedState) {
    return json({
      error: "competition_state_conflict",
      currentState: current.lifecycleState
    }, 409);
  }
  if (!canTransitionCompetition(expectedState, targetState)) {
    return json({ error: "competition_transition_not_allowed" }, 409);
  }

  if (expectedState === "DRAFT" && targetState === "UPCOMING") {
    const readiness = validatePublishableCompetitionConfig(current.config);
    if (readiness.length) {
      return json({
        error: "competition_not_publishable",
        publishReadiness: readiness
      }, 409);
    }
  }

  const now = new Date().toISOString();
  try {
    const result = await transitionCompetitionState(context.env.COMPETITIONS_DB, {
      competitionId: id,
      expectedState,
      targetState,
      operationId,
      auditEventId: crypto.randomUUID(),
      actorSubject: authorized.session.subject,
      actorUuid: authorized.session.player.uuid,
      note: changeNote,
      createdAt: now
    });

    if (result.status !== "UPDATED") {
      return json({ error: "competition_state_conflict" }, 409);
    }

    const competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
    return json({ competition, idempotentReplay: false });
  } catch (error) {
    const message = String(error?.message ?? error);
    if (message.includes("UNIQUE constraint")) {
      const competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id).catch(() => null);
      if (competition?.lastLifecycleOperationId === operationId && competition.lifecycleState === targetState) {
        return json({ competition, idempotentReplay: true });
      }
      return json({ error: "competition_state_conflict" }, 409);
    }
    return json({ error: "competition_state_update_failed" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["POST"]);
}
