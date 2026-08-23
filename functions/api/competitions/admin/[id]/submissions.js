import { authenticateRequest } from "../../../../lib/auth.js";
import {
  canModerateCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase
} from "../../../../lib/competitions/access.js";
import { getAdminCompetition } from "../../../../lib/competitions/drafts.js";
import { listStaffCompetitionSubmissions } from "../../../../lib/competitions/staff-submissions.js";
import { json, methodNotAllowed, unauthorized } from "../../../../lib/responses.js";
import { isCanonicalUuid } from "../../../../lib/validation.js";

function competitionId(context) {
  const value = typeof context?.params?.id === "string" ? context.params.id.trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
}

export async function onRequestGet(context) {
  if (!competitionsEnabled(context.env)) return json({ error: "not_found" }, 404);
  const id = competitionId(context);
  if (!id) return json({ error: "competition_not_found" }, 404);
  if (!hasCompetitionDatabase(context.env)) return json({ error: "competition_database_unavailable" }, 503);

  let session;
  try {
    session = await authenticateRequest(context.request, context.env);
  } catch {
    return unauthorized();
  }
  if (!canModerateCompetitions(session, context.env)) {
    return json({ error: "competition_moderator_required" }, 403);
  }

  try {
    const competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
    if (!competition) return json({ error: "competition_not_found" }, 404);
    const submissions = await listStaffCompetitionSubmissions(context.env.COMPETITIONS_DB, id);
    return json({
      competition: {
        id: competition.id,
        title: competition.title,
        lifecycleState: competition.lifecycleState,
        configVersion: competition.configVersion
      },
      submissions
    });
  } catch {
    return json({ error: "competition_submission_queue_unavailable" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}

export { competitionId };
