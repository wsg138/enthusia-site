import { authenticateRequest } from "../../../lib/auth.js";
import {
  competitionsEnabled,
  hasCompetitionDatabase
} from "../../../lib/competitions/access.js";
import { getAdminCompetition } from "../../../lib/competitions/drafts.js";
import {
  getActiveCompetitionJudge,
  getJudgeScore,
  saveJudgeScore
} from "../../../lib/competitions/judges.js";
import { publicCompetitionConfig, publicSubmissionDetail } from "../../../lib/competitions/public.js";
import {
  getPrivateSubmissionLocation,
  listAcceptedPublicParticipantsByCompetition,
  listApprovedPublicSubmissions
} from "../../../lib/competitions/repository.js";
import { json, methodNotAllowed, unauthorized } from "../../../lib/responses.js";
import { requireSameOrigin } from "../../../lib/security.js";
import { isCanonicalUuid } from "../../../lib/validation.js";

function competitionId(context) {
  const value = typeof context?.params?.id === "string" ? context.params.id.trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
}

function groupParticipants(rows) {
  const grouped = new Map();
  for (const participant of rows) {
    if (!grouped.has(participant.submissionId)) grouped.set(participant.submissionId, []);
    grouped.get(participant.submissionId).push(participant);
  }
  return grouped;
}

async function authorizeJudge(context, id) {
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
  if (!hasCompetitionDatabase(context.env)) {
    return { response: json({ error: "competition_database_unavailable" }, 503) };
  }

  let session;
  try {
    session = await authenticateRequest(context.request, context.env);
  } catch {
    return { response: unauthorized() };
  }

  try {
    const assignment = await getActiveCompetitionJudge(
      context.env.COMPETITIONS_DB,
      id,
      session.player.uuid
    );
    if (!assignment) return { response: json({ error: "competition_judge_required" }, 403) };
    return { session, assignment };
  } catch {
    return { response: json({ error: "competition_judge_unavailable" }, 503) };
  }
}

async function judgeWorkspace(context, id, authorized) {
  const competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
  if (!competition) return null;
  if (competition.lifecycleState !== "JUDGING") {
    return {
      competition: {
        id: competition.id,
        title: competition.title,
        category: competition.category,
        lifecycleState: competition.lifecycleState
      },
      judgingOpen: false,
      entries: []
    };
  }

  const [submissions, participants] = await Promise.all([
    listApprovedPublicSubmissions(context.env.COMPETITIONS_DB, id),
    listAcceptedPublicParticipantsByCompetition(context.env.COMPETITIONS_DB, id)
  ]);
  const grouped = groupParticipants(participants);

  const entries = await Promise.all(submissions.map(async (submission) => {
    const [existingScore, location] = await Promise.all([
      getJudgeScore(context.env.COMPETITIONS_DB, id, submission.id, authorized.session.player.uuid),
      authorized.assignment.canViewCoordinates
        ? getPrivateSubmissionLocation(context.env.COMPETITIONS_DB, submission.id)
        : Promise.resolve(null)
    ]);
    return {
      ...publicSubmissionDetail(submission, grouped.get(submission.id) ?? []),
      location: location ? {
        worldName: location.worldName,
        x: location.x,
        y: location.y,
        z: location.z,
        exactCoordinatesConfirmed: Boolean(location.exactCoordinatesConfirmed)
      } : null,
      score: existingScore
    };
  }));

  return {
    competition: {
      id: competition.id,
      title: competition.title,
      category: competition.category,
      lifecycleState: competition.lifecycleState,
      configVersion: competition.configVersion,
      config: publicCompetitionConfig(competition.config)
    },
    judgingOpen: true,
    canViewCoordinates: authorized.assignment.canViewCoordinates,
    coordinateNotice: authorized.assignment.canViewCoordinates
      ? "You are an assigned judge and may view private submission coordinates for this competition. Coordinate access is staff-audited and must not be shared."
      : null,
    entries
  };
}

export async function onRequestGet(context) {
  const id = competitionId(context);
  if (!id) return json({ error: "competition_not_found" }, 404);
  const authorized = await authorizeJudge(context, id);
  if (authorized.response) return authorized.response;

  try {
    const workspace = await judgeWorkspace(context, id, authorized);
    if (!workspace) return json({ error: "competition_not_found" }, 404);
    return json(workspace);
  } catch {
    return json({ error: "competition_judge_workspace_unavailable" }, 503);
  }
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const id = competitionId(context);
  if (!id) return json({ error: "competition_not_found" }, 404);
  const authorized = await authorizeJudge(context, id);
  if (authorized.response) return authorized.response;

  let input;
  try {
    input = await context.request.json();
  } catch {
    input = null;
  }
  const submissionId = typeof input?.submissionId === "string" ? input.submissionId.trim().toLowerCase() : "";
  if (!isCanonicalUuid(submissionId)) return json({ error: "invalid_judge_score" }, 400);

  let competition;
  try {
    competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
  } catch {
    return json({ error: "competition_database_unavailable" }, 503);
  }
  if (!competition) return json({ error: "competition_not_found" }, 404);
  if (competition.lifecycleState !== "JUDGING" || !competition.config?.judging?.enabled) {
    return json({ error: "judging_not_open" }, 409);
  }

  const criteria = competition.config?.judging?.criteria ?? [];
  try {
    const saved = await saveJudgeScore(context.env.COMPETITIONS_DB, {
      competitionId: id,
      submissionId,
      judgeUuid: authorized.session.player.uuid,
      configVersion: competition.configVersion,
      criteria,
      scores: input?.scores,
      bonusPoints: input?.bonusPoints ?? 0,
      publicFeedback: input?.publicFeedback ?? null,
      privateNote: input?.privateNote ?? null,
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return json({ submissionId, ...saved });
  } catch (error) {
    const message = String(error?.message ?? error);
    if (message.includes("competition_judge_score_not_allowed")) {
      return json({ error: "judge_score_not_allowed" }, 409);
    }
    if (error instanceof TypeError || error instanceof RangeError) {
      return json({ error: "invalid_judge_score", detail: message }, 400);
    }
    return json({ error: "judge_score_save_failed" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET", "POST"]);
}

export { groupParticipants };
