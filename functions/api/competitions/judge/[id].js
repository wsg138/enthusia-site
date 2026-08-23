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
import { getCompetitionParticipantSession, linkedMinecraftUuids } from "../../../lib/competitions/participant-auth.js";
import { publicCompetitionConfig, publicSubmissionDetail } from "../../../lib/competitions/public.js";
import { listPublicSubmissionImages } from "../../../lib/competitions/public-submission-media.js";
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

function groupRows(rows, key = "submissionId") {
  const grouped = new Map();
  for (const row of rows) {
    const id = row[key];
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(row);
  }
  return grouped;
}

function judgingWindowOpen(competition, now = Date.now()) {
  if (competition?.lifecycleState !== "JUDGING" || !competition?.config?.judging?.enabled) return false;
  const openAt = Date.parse(competition.config?.schedule?.judgingOpenAt ?? "");
  const closeAt = Date.parse(competition.config?.schedule?.judgingCloseAt ?? "");
  return Number.isFinite(openAt) && Number.isFinite(closeAt) && now >= openAt && now < closeAt;
}

async function authorizeJudge(context, id) {
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
  if (!hasCompetitionDatabase(context.env)) {
    return { response: json({ error: "competition_database_unavailable" }, 503) };
  }

  let session;
  try {
    session = await getCompetitionParticipantSession(context.request, context.env.COMPETITIONS_DB);
  } catch {
    return { response: json({ error: "competition_identity_unavailable" }, 503) };
  }
  if (!session) return { response: unauthorized() };
  const linkedUuids = linkedMinecraftUuids(session);
  if (!linkedUuids.length) return { response: json({ error: "minecraft_link_required" }, 403) };

  try {
    for (const judgeUuid of linkedUuids) {
      const assignment = await getActiveCompetitionJudge(context.env.COMPETITIONS_DB, id, judgeUuid);
      if (assignment) return { session, assignment, judgeUuid };
    }
    return { response: json({ error: "competition_judge_required" }, 403) };
  } catch {
    return { response: json({ error: "competition_judge_unavailable" }, 503) };
  }
}

async function judgeWorkspace(context, id, authorized) {
  const competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
  if (!competition) return null;
  if (!judgingWindowOpen(competition)) {
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

  const [submissions, participants, images] = await Promise.all([
    listApprovedPublicSubmissions(context.env.COMPETITIONS_DB, id),
    listAcceptedPublicParticipantsByCompetition(context.env.COMPETITIONS_DB, id),
    listPublicSubmissionImages(context.env.COMPETITIONS_DB, id)
  ]);
  const groupedParticipants = groupRows(participants);
  const groupedImages = groupRows(images);

  const entries = await Promise.all(submissions.map(async (submission) => {
    const [existingScore, location] = await Promise.all([
      getJudgeScore(context.env.COMPETITIONS_DB, id, submission.id, authorized.judgeUuid),
      authorized.assignment.canViewCoordinates
        ? getPrivateSubmissionLocation(context.env.COMPETITIONS_DB, submission.id)
        : Promise.resolve(null)
    ]);
    return {
      ...publicSubmissionDetail(
        submission,
        groupedParticipants.get(submission.id) ?? [],
        groupedImages.get(submission.id) ?? []
      ),
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
    judgeMinecraftUuid: authorized.judgeUuid,
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
  if (!judgingWindowOpen(competition)) return json({ error: "judging_not_open" }, 409);

  const criteria = competition.config?.judging?.criteria ?? [];
  try {
    const saved = await saveJudgeScore(context.env.COMPETITIONS_DB, {
      competitionId: id,
      submissionId,
      judgeUuid: authorized.judgeUuid,
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

export { groupRows, judgingWindowOpen };
