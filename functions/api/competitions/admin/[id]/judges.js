import { authenticateRequest } from "../../../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase
} from "../../../../lib/competitions/access.js";
import { getAdminCompetition } from "../../../../lib/competitions/drafts.js";
import {
  assignCompetitionJudge,
  listCompetitionJudges,
  removeCompetitionJudge
} from "../../../../lib/competitions/judges.js";
import { json, methodNotAllowed, unauthorized } from "../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../lib/validation.js";

const MUTABLE_JUDGE_STATES = new Set([
  "DRAFT",
  "UPCOMING",
  "SUBMISSIONS_OPEN",
  "REVIEW",
  "VOTING"
]);

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

export async function onRequestGet(context) {
  const id = competitionId(context);
  if (!id) return json({ error: "competition_not_found" }, 404);
  const authorized = await authorizeManager(context);
  if (authorized.response) return authorized.response;

  try {
    const competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
    if (!competition) return json({ error: "competition_not_found" }, 404);
    const judges = await listCompetitionJudges(context.env.COMPETITIONS_DB, id, { includeRemoved: true });
    return json({ competitionId: id, lifecycleState: competition.lifecycleState, judges });
  } catch {
    return json({ error: "competition_judges_unavailable" }, 503);
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

  const action = input?.action;
  const judgeUuid = typeof input?.judgeUuid === "string" ? input.judgeUuid.trim().toLowerCase() : "";
  if (!isCanonicalUuid(judgeUuid) || !new Set(["ASSIGN", "REMOVE"]).has(action)) {
    return json({ error: "invalid_judge_request" }, 400);
  }

  let competition;
  try {
    competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
  } catch {
    return json({ error: "competition_database_unavailable" }, 503);
  }
  if (!competition) return json({ error: "competition_not_found" }, 404);
  if (!MUTABLE_JUDGE_STATES.has(competition.lifecycleState)) {
    return json({ error: "judge_roster_locked", lifecycleState: competition.lifecycleState }, 409);
  }

  const now = new Date().toISOString();
  try {
    if (action === "ASSIGN") {
      const judgeName = typeof input?.judgeName === "string" ? input.judgeName.trim() : "";
      if (!/^[A-Za-z0-9_]{1,16}$/.test(judgeName)) {
        return json({ error: "invalid_judge_name" }, 400);
      }
      await assignCompetitionJudge(context.env.COMPETITIONS_DB, {
        competitionId: id,
        judgeUuid,
        judgeName,
        assignedByUuid: authorized.session.player.uuid,
        actorSubject: authorized.session.subject,
        assignedAt: now,
        canViewCoordinates: Boolean(
          competition.config?.entries?.coordinatesRequested
          && competition.config?.entries?.judgesCanViewCoordinates
        ),
        auditEventId: crypto.randomUUID(),
        note: `Assigned judge ${judgeName}`
      });
    } else {
      const removed = await removeCompetitionJudge(context.env.COMPETITIONS_DB, {
        competitionId: id,
        judgeUuid,
        removedByUuid: authorized.session.player.uuid,
        actorSubject: authorized.session.subject,
        removedAt: now,
        auditEventId: crypto.randomUUID(),
        note: "Judge removed"
      });
      if (!removed) return json({ error: "judge_not_active" }, 404);
    }

    const judges = await listCompetitionJudges(context.env.COMPETITIONS_DB, id, { includeRemoved: true });
    return json({ competitionId: id, judges });
  } catch (error) {
    const message = String(error?.message ?? error);
    if (message.includes("competition_judge_is_submission_owner") || message.includes("competition_judge_is_entry_participant")) {
      return json({ error: "judge_conflicts_with_entry" }, 409);
    }
    return json({ error: "competition_judge_update_failed" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET", "POST"]);
}
