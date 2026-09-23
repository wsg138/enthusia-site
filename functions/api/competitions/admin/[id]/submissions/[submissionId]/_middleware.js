import { authenticateRequest } from "../../../../../../lib/auth.js";
import { canModerateCompetitions, competitionsEnabled, hasCompetitionDatabase } from "../../../../../../lib/competitions/access.js";
import { getStaffSubmission } from "../../../../../../lib/competitions/staff-submissions.js";
import { staffSubmissionConflict } from "../../../../../../lib/competitions/staff-conflicts.js";
import { json, unauthorized } from "../../../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../../../lib/validation.js";

const CONFLICT_ACTIONS = new Set([
  "APPROVE",
  "NEEDS_CHANGES",
  "REJECT",
  "DISQUALIFY",
  "REMOVE",
  "RESTORE",
  "EDIT"
]);

function paramUuid(context, key) {
  const value = typeof context?.params?.[key] === "string" ? context.params[key].trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return context.next();
  if (!competitionsEnabled(context.env)) return context.next();
  if (!hasCompetitionDatabase(context.env)) return context.next();
  if (!requireSameOrigin(context.request)) return context.next();

  let input;
  try {
    input = await context.request.clone().json();
  } catch {
    return context.next();
  }
  if (!CONFLICT_ACTIONS.has(input?.action)) return context.next();

  let session;
  try {
    session = await authenticateRequest(context.request, context.env);
  } catch {
    return unauthorized();
  }
  if (!canModerateCompetitions(session, context.env)) return context.next();

  const competitionId = paramUuid(context, "id");
  const submissionId = paramUuid(context, "submissionId");
  if (!competitionId || !submissionId) return context.next();

  let submission;
  try {
    submission = await getStaffSubmission(context.env.COMPETITIONS_DB, competitionId, submissionId);
  } catch {
    return json({ error: "submission_unavailable" }, 503);
  }
  if (!submission) return context.next();

  try {
    const conflict = await staffSubmissionConflict(
      context.env.COMPETITIONS_DB,
      context.env,
      submission,
      session.player.uuid
    );
    if (conflict.conflict) {
      return json({
        error: "staff_cannot_moderate_own_entry",
        conflictReason: conflict.reason
      }, 409);
    }
  } catch {
    // Guild ownership is authoritative in the Minecraft guild provider. If that
    // provider is unavailable, fail closed rather than allow an unverified staff
    // member to moderate a guild-owned entry.
    if (submission.entryType === "GUILD") {
      return json({ error: "staff_conflict_check_unavailable" }, 503);
    }
    return json({ error: "staff_conflict_check_unavailable" }, 503);
  }

  return context.next();
}

export { CONFLICT_ACTIONS, paramUuid };
