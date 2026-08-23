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

function linkedAccounts(playerContext, session) {
  const accounts = new Set();
  for (const raw of session?.linkedMinecraftAccounts ?? []) {
    const uuid = String(raw?.uuid ?? "").trim().toLowerCase();
    if (isCanonicalUuid(uuid)) accounts.add(uuid);
  }
  // Compatibility fallback for older unit contracts only.
  for (const raw of playerContext?.linkedMinecraftAccounts ?? []) {
    const uuid = String(typeof raw === "string" ? raw : raw?.uuid ?? "").trim().toLowerCase();
    if (isCanonicalUuid(uuid)) accounts.add(uuid);
  }
  if (session?.player?.uuid && isCanonicalUuid(session.player.uuid)) accounts.add(session.player.uuid);
  return accounts;
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

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const authorized = await authorize(context);
  if (authorized.response) return authorized.response;

  let input;
  try {
    input = await context.request.json();
  } catch {
    input = null;
  }
  const competitionId = String(input?.competitionId ?? "").trim().toLowerCase();
  const submissionId = String(input?.submissionId ?? "").trim().toLowerCase();
  const playerUuid = String(input?.playerUuid ?? "").trim().toLowerCase();
  const accept = input?.accept;
  if (
    !isCanonicalUuid(competitionId)
    || !isCanonicalUuid(submissionId)
    || !isCanonicalUuid(playerUuid)
    || typeof accept !== "boolean"
    || !authorized.accounts.has(playerUuid)
  ) return json({ error: "invalid_invite_response" }, 400);

  try {
    const [invite, competition] = await Promise.all([
      getPendingSubmissionInvite(context.env.COMPETITIONS_DB, competitionId, submissionId, playerUuid),
      getAdminCompetition(context.env.COMPETITIONS_DB, competitionId)
    ]);
    if (!invite || !competition) return json({ error: "invite_not_found" }, 404);
    if (!canChangeParticipantRoster(competition.lifecycleState, accept ? "ACCEPT" : "DECLINE", { existingPendingInvite: true })) {
      return json({ error: "contributor_roster_locked" }, 409);
    }

    if (accept && invite.role === "MAIN") {
      const count = await countLinkedPlayerEntrySlots(
        context.env.COMPETITIONS_DB,
        competitionId,
        [...authorized.accounts]
      );
      if (count >= competition.config.entries.maxEntriesPerPlayer) {
        return json({ error: "player_entry_limit_reached" }, 409);
      }
    }

    const respondedAt = new Date().toISOString();
    const updated = await respondSubmissionInvite(context.env.COMPETITIONS_DB, {
      competitionId,
      submissionId,
      playerUuid,
      actorSubject: authorized.session.subject,
      accept,
      respondedAt,
      auditEventId: crypto.randomUUID()
    });
    if (!updated) return json({ error: "invite_not_found" }, 404);
    return json({
      competitionId,
      submissionId,
      playerUuid,
      inviteStatus: accept ? "ACCEPTED" : "DECLINED",
      respondedAt
    });
  } catch (error) {
    const message = String(error?.message ?? error);
    if (message.includes("competition_judge_cannot_enter") || message.includes("competition_linked_judge_cannot_enter")) {
      return json({ error: "judge_can_only_be_helper" }, 409);
    }
    if (message.includes("competition_linked_entry_limit_reached")) {
      return json({ error: "player_entry_limit_reached" }, 409);
    }
    return json({ error: "invite_response_failed" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET", "POST"]);
}

export { linkedAccounts };
