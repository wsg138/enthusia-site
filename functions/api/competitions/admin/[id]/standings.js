import { authenticateRequest } from "../../../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase
} from "../../../../lib/competitions/access.js";
import { getAdminCompetition } from "../../../../lib/competitions/drafts.js";
import { listCompetitionJudgeScores, listCompetitionJudges } from "../../../../lib/competitions/judges.js";
import { listApprovedPublicSubmissions } from "../../../../lib/competitions/repository.js";
import { replaceProvisionalResultSet } from "../../../../lib/competitions/result-draft-set.js";
import { listProvisionalResults } from "../../../../lib/competitions/results.js";
import { buildCompetitionStandings } from "../../../../lib/competitions/standings.js";
import {
  countCompetitionBallots,
  listCompetitionVoteTotals
} from "../../../../lib/competitions/voting.js";
import { json, methodNotAllowed, unauthorized } from "../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../lib/validation.js";

function competitionId(context) {
  const value = typeof context?.params?.id === "string" ? context.params.id.trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
}

async function authorizeManager(context) {
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
  if (!hasCompetitionDatabase(context.env)) return { response: json({ error: "competition_database_unavailable" }, 503) };
  let session;
  try {
    session = await authenticateRequest(context.request, context.env);
  } catch {
    return { response: unauthorized() };
  }
  if (!canManageCompetitions(session, context.env)) {
    return { response: json({ error: "competition_manager_required" }, 403) };
  }
  return { session };
}

async function compute(context, competition, tieOrder = null) {
  const [submissions, voteTotals, ballotCount, judgeScores, activeJudges] = await Promise.all([
    listApprovedPublicSubmissions(context.env.COMPETITIONS_DB, competition.id),
    competition.config?.voting?.enabled
      ? listCompetitionVoteTotals(context.env.COMPETITIONS_DB, competition.id)
      : Promise.resolve([]),
    competition.config?.voting?.enabled
      ? countCompetitionBallots(context.env.COMPETITIONS_DB, competition.id)
      : Promise.resolve(0),
    competition.config?.judging?.enabled
      ? listCompetitionJudgeScores(context.env.COMPETITIONS_DB, competition.id)
      : Promise.resolve([]),
    competition.config?.judging?.enabled
      ? listCompetitionJudges(context.env.COMPETITIONS_DB, competition.id)
      : Promise.resolve([])
  ]);

  // Historical score rows remain valuable for audit purposes after a judge is
  // unassigned, but they must not continue to influence the active scoring set.
  // Otherwise replacing a judge after they scored can make readiness report an
  // impossible N+1/N score count forever.
  const activeJudgeUuids = new Set(activeJudges.map((judge) => judge.judgeUuid));
  const activeJudgeScores = judgeScores.filter((score) => activeJudgeUuids.has(score.judgeUuid));

  return buildCompetitionStandings({
    competitionId: competition.id,
    configVersion: competition.configVersion,
    config: competition.config,
    submissions,
    voteTotals,
    ballotCount,
    judgeScores: activeJudgeScores,
    activeJudgeCount: activeJudges.length,
    tieOrder
  });
}

export async function onRequestGet(context) {
  const id = competitionId(context);
  if (!id) return json({ error: "competition_not_found" }, 404);
  const authorized = await authorizeManager(context);
  if (authorized.response) return authorized.response;
  try {
    const competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
    if (!competition) return json({ error: "competition_not_found" }, 404);
    const [computed, saved] = await Promise.all([
      compute(context, competition),
      listProvisionalResults(context.env.COMPETITIONS_DB, id)
    ]);
    return json({
      competition: {
        id,
        title: competition.title,
        lifecycleState: competition.lifecycleState,
        configVersion: competition.configVersion
      },
      computed,
      saved
    });
  } catch (error) {
    return json({ error: "competition_standings_unavailable", detail: String(error?.message ?? error) }, 503);
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
  const operationId = String(input?.idempotencyKey ?? "").trim().toLowerCase();
  if (!isCanonicalUuid(operationId)) return json({ error: "idempotency_key_required" }, 400);
  const tieOrder = input?.tieOrder ?? null;
  if (tieOrder !== null && (!tieOrder || typeof tieOrder !== "object" || Array.isArray(tieOrder))) {
    return json({ error: "invalid_tiebreak_order" }, 400);
  }

  try {
    const competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
    if (!competition) return json({ error: "competition_not_found" }, 404);
    if (competition.lifecycleState !== "RESULTS_READY") {
      return json({ error: "results_not_ready_for_review", lifecycleState: competition.lifecycleState }, 409);
    }

    const computed = await compute(context, competition, tieOrder);
    if (!computed.ready) {
      return json({
        error: "provisional_results_not_ready",
        errors: computed.errors,
        unresolvedTies: computed.unresolvedTies,
        standings: computed.standings
      }, 409);
    }

    const now = new Date().toISOString();
    const replacement = await replaceProvisionalResultSet(context.env.COMPETITIONS_DB, {
      competitionId: id,
      configVersion: competition.configVersion,
      operationId,
      actorUuid: authorized.session.player.uuid,
      actorSubject: authorized.session.subject,
      createdAt: now,
      auditEventId: crypto.randomUUID(),
      note: "Recalculated provisional competition standings",
      results: computed.standings.map((standing) => ({
        submissionId: standing.submissionId,
        placement: standing.placement,
        finalScore: standing.finalScore,
        communityComponent: standing.communityComponent,
        judgeComponent: standing.judgeComponent,
        snapshot: standing.snapshot
      }))
    });
    if (replacement.status === "OPERATION_CONFLICT") return json({ error: "idempotency_conflict" }, 409);
    if (replacement.status === "CONFLICT") return json({ error: "results_state_conflict" }, 409);
    const saved = await listProvisionalResults(context.env.COMPETITIONS_DB, id);
    return json({ status: replacement.status, computed, saved });
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      return json({ error: "invalid_standings_configuration", detail: String(error.message) }, 400);
    }
    return json({ error: "competition_standings_update_failed", detail: String(error?.message ?? error) }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET", "POST"]);
}

export { competitionId, compute };
