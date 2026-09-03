import { competitionsEnabled, hasCompetitionDatabase } from "../../lib/competitions/access.js";
import {
  getPendingSubmissionInvite,
  listPendingInvitesForPlayer,
  respondSubmissionInvite
} from "../../lib/competitions/contributors.js";
import { getAdminCompetition } from "../../lib/competitions/drafts.js";
import { getCompetitionParticipantSession, linkedMinecraftUuids } from "../../lib/competitions/participant-auth.js";
import { canChangeParticipantRoster } from "../../lib/competitions/participants.js";
import { countLinkedPlayerEntrySlots } from "../../lib/competitions/submissions.js";
import { json, methodNotAllowed, unauthorized } from "../../lib/responses.js";
import { requireSameOrigin } from "../../lib/security.js";
import { isCanonicalUuid } from "../../lib/validation.js";

function canonicalUuid(value) {
  const uuid = String(value ?? "").trim().toLowerCase();
  return isCanonicalUuid(uuid) ? uuid : null;
}

function inviteResponseInput(input, accounts) {
  if (!input || typeof input !== "object") return null;
  const competitionId = canonicalUuid(input.competitionId);
  const submissionId = canonicalUuid(input.submissionId);
  const playerUuid = canonicalUuid(input.playerUuid);
  if (!competitionId || !submissionId || !playerUuid || typeof input.accept !== "boolean" || !accounts.has(playerUuid)) {
    return null;
  }
  return { competitionId, submissionId, playerUuid, accept: input.accept };
}

async function readInviteResponse(request, accounts) {
  try {
    return inviteResponseInput(await request.json(), accounts);
  } catch {
    return null;
  }
}

async function authorize(context) {
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
  if (!hasCompetitionDatabase(context.env)) return { response: json({ error: "competition_database_unavailable" }, 503) };
  let session;
  try {
    session = await getCompetitionParticipantSession(context.request, context.env.COMPETITIONS_DB);
  } catch {
    return { response: json({ error: "competition_identity_unavailable" }, 503) };
  }
  if (!session) return { response: unauthorized() };
  const accounts = new Set(linkedMinecraftUuids(session));
  if (!accounts.size) return { response: json({ error: "minecraft_link_required" }, 403) };
  return { session, accounts };
}

export async function onRequestGet(context) {
  const authorized = await authorize(context);
  if (authorized.response) return authorized.response;
  try {
    const groups = await Promise.all(
      [...authorized.accounts].map((uuid) => listPendingInvitesForPlayer(context.env.COMPETITIONS_DB, uuid))
    );
    const invites = groups.flat().sort((left, right) =>
      String(left.invitedAt).localeCompare(String(right.invitedAt))
      || String(left.submissionId).localeCompare(String(right.submissionId))
    );
    return json({ invites });
  } catch {
    return json({ error: "competition_invites_unavailable" }, 503);
  }
}

async function loadInviteContext(db, input) {
  const [invite, competition] = await Promise.all([
    getPendingSubmissionInvite(db, input.competitionId, input.submissionId, input.playerUuid),
    getAdminCompetition(db, input.competitionId)
  ]);
  return invite && competition ? { invite, competition } : null;
}

function rosterConflict(competition, accept) {
  const operation = accept ? "ACCEPT" : "DECLINE";
  return canChangeParticipantRoster(competition.lifecycleState, operation, { existingPendingInvite: true })
    ? null
    : json({ error: "contributor_roster_locked" }, 409);
}

async function entryLimitConflict(db, loaded, input, accounts) {
  if (!input.accept || loaded.invite.role !== "MAIN") return null;
  const count = await countLinkedPlayerEntrySlots(db, input.competitionId, [...accounts]);
  return count >= loaded.competition.config.entries.maxEntriesPerPlayer
    ? json({ error: "player_entry_limit_reached" }, 409)
    : null;
}

async function applyInviteResponse(context, authorized, input) {
  const database = context.env.COMPETITIONS_DB;
  const loaded = await loadInviteContext(database, input);
  if (!loaded) return json({ error: "invite_not_found" }, 404);
  const rosterResponse = rosterConflict(loaded.competition, input.accept);
  if (rosterResponse) return rosterResponse;
  const limitResponse = await entryLimitConflict(database, loaded, input, authorized.accounts);
  if (limitResponse) return limitResponse;

  const respondedAt = new Date().toISOString();
  const updated = await respondSubmissionInvite(database, {
    ...input,
    actorSubject: authorized.session.subject,
    respondedAt,
    auditEventId: crypto.randomUUID()
  });
  if (!updated) return json({ error: "invite_not_found" }, 404);
  return json({
    ...input,
    inviteStatus: input.accept ? "ACCEPTED" : "DECLINED",
    respondedAt
  });
}

function inviteFailureResponse(error) {
  const message = String(error?.message ?? error);
  if (message.includes("competition_judge_cannot_enter") || message.includes("competition_linked_judge_cannot_enter")) {
    return json({ error: "judge_can_only_be_helper" }, 409);
  }
  if (message.includes("competition_linked_entry_limit_reached")) {
    return json({ error: "player_entry_limit_reached" }, 409);
  }
  return json({ error: "invite_response_failed" }, 503);
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const authorized = await authorize(context);
  if (authorized.response) return authorized.response;

  const input = await readInviteResponse(context.request, authorized.accounts);
  if (!input) return json({ error: "invalid_invite_response" }, 400);

  try {
    return await applyInviteResponse(context, authorized, input);
  } catch (error) {
    return inviteFailureResponse(error);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET", "POST"]);
}

export { inviteFailureResponse, inviteResponseInput };
