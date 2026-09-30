import { authenticateRequest } from "../../../../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase
} from "../../../../../lib/competitions/access.js";
import { getAdminCompetition } from "../../../../../lib/competitions/drafts.js";
import {
  replaceProvisionalResultSet
} from "../../../../../lib/competitions/result-draft-set.js";
import {
  listProvisionalResults,
  resultPublicationReadiness
} from "../../../../../lib/competitions/results.js";
import { json, methodNotAllowed, unauthorized } from "../../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../../lib/validation.js";

function competitionId(context) {
  const value = typeof context?.params?.id === "string" ? context.params.id.trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
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

function note(value) {
  if (value === null || value === undefined || value === "") return "Provisional standings recomputed";
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
    const [results, readiness] = await Promise.all([
      listProvisionalResults(context.env.COMPETITIONS_DB, id),
      resultPublicationReadiness(context.env.COMPETITIONS_DB, id)
    ]);
    return json({
      competition: {
        id: competition.id,
        lifecycleState: competition.lifecycleState,
        configVersion: competition.configVersion
      },
      results,
      publicationReadiness: readiness
    });
  } catch {
    return json({ error: "competition_results_unavailable" }, 503);
  }
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
  const changeNote = note(input?.note);
  if (
    !isCanonicalUuid(operationId)
    || !Number.isInteger(input?.expectedConfigVersion)
    || input.expectedConfigVersion < 1
    || !Array.isArray(input?.results)
    || !changeNote
  ) {
    return json({ error: "invalid_provisional_results_request" }, 400);
  }

  let competition;
  try {
    competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
  } catch {
    return json({ error: "competition_database_unavailable" }, 503);
  }
  if (!competition) return json({ error: "competition_not_found" }, 404);
  if (competition.lifecycleState !== "RESULTS_READY") {
    return json({
      error: "competition_results_wrong_state",
      currentState: competition.lifecycleState
    }, 409);
  }
  if (competition.configVersion !== input.expectedConfigVersion) {
    return json({
      error: "competition_version_conflict",
      currentVersion: competition.configVersion
    }, 409);
  }

  try {
    const result = await replaceProvisionalResultSet(context.env.COMPETITIONS_DB, {
      competitionId: id,
      operationId,
      configVersion: input.expectedConfigVersion,
      actorUuid: authorized.session.player.uuid,
      actorSubject: authorized.session.subject,
      createdAt: new Date().toISOString(),
      auditEventId: crypto.randomUUID(),
      note: changeNote,
      results: input.results
    });

    if (result.status === "OPERATION_CONFLICT") {
      return json({ error: "provisional_results_operation_conflict" }, 409);
    }
    if (result.status === "CONFLICT") {
      return json({ error: "provisional_results_conflict" }, 409);
    }

    const [results, readiness] = await Promise.all([
      listProvisionalResults(context.env.COMPETITIONS_DB, id),
      resultPublicationReadiness(context.env.COMPETITIONS_DB, id)
    ]);
    return json({
      status: result.status,
      resultSetHash: result.resultSetHash,
      results,
      publicationReadiness: readiness
    });
  } catch (error) {
    const message = String(error?.message ?? error);
    if (message.includes("competition_result_drafts_")) {
      return json({ error: "provisional_results_conflict" }, 409);
    }
    if (error instanceof TypeError || error instanceof RangeError) {
      return json({ error: "invalid_provisional_results" }, 400);
    }
    return json({ error: "provisional_results_update_failed" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET", "POST"]);
}
