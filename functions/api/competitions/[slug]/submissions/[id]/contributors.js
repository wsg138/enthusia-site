import { competitionsEnabled, hasCompetitionDatabase } from "../../../../../lib/competitions/access.js";
import { competitionPlayerLookup } from "../../../../../lib/competitions/bridge.js";
import {
  inviteSubmissionContributor,
  removeSubmissionContributor
} from "../../../../../lib/competitions/contributors.js";
import { isActiveCompetitionJudge } from "../../../../../lib/competitions/judges.js";
import { getCompetitionParticipantSession } from "../../../../../lib/competitions/participant-auth.js";
import { canChangeParticipantRoster } from "../../../../../lib/competitions/participants.js";
import { authorizeCompetitionRead } from "../../../../../lib/competitions/public-access.js";
import { getPublicCompetitionBySlug } from "../../../../../lib/competitions/repository.js";
import { getAccountSubmission, listSubmissionParticipants } from "../../../../../lib/competitions/submissions.js";
import { json, methodNotAllowed, unauthorized } from "../../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../../lib/validation.js";

function slugValue(context) {
  const value = typeof context?.params?.slug === "string" ? context.params.slug.trim().toLowerCase() : "";
  return /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(value) ? value : null;
}

function submissionId(context) {
  const value = typeof context?.params?.id === "string" ? context.params.id.trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
}

async function resolveOwner(context) {
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
  const read = await authorizeCompetitionRead(context);
  if (read.response) return { response: read.response };
  if (!hasCompetitionDatabase(context.env)) return { response: json({ error: "competition_database_unavailable" }, 503) };
  let session;
  try {
    session = await getCompetitionParticipantSession(context.request, context.env.COMPETITIONS_DB);
  } catch {
    return { response: json({ error: "competition_identity_unavailable" }, 503) };
  }
  if (!session) return { response: unauthorized() };
  const slug = slugValue(context);
  const id = submissionId(context);
  if (!slug || !id) return { response: json({ error: "submission_not_found" }, 404) };
  try {
    const competition = await getPublicCompetitionBySlug(context.env.COMPETITIONS_DB, slug);
    if (!competition) return { response: json({ error: "competition_not_found" }, 404) };
    const submission = await getAccountSubmission(context.env.COMPETITIONS_DB, competition.id, id, session.subject);
    if (!submission) return { response: json({ error: "submission_not_found" }, 404) };
    return { session, competition, submission };
  } catch {
    return { response: json({ error: "submission_unavailable" }, 503) };
  }
}

function roleAllowed(entryType, role) {
  if (entryType === "GROUP") return role === "MAIN" || role === "HELPER";
  if (entryType === "GUILD") return role === "GUILD_WORKER";
  return false;
}

function participantRoleLimit(competition, role) {
  if (role === "MAIN") return competition.config.entries.maxMainMembers;
  if (role === "HELPER") return competition.config.entries.maxHelpers;
  return null;
}

function roleLimitReached(competition, participants, role) {
  const limit = participantRoleLimit(competition, role);
  if (!Number.isInteger(limit)) return false;
  return participants.filter((participant) => (
    participant.role === role && participant.inviteStatus !== "DECLINED"
  )).length >= limit;
}

export async function onRequestGet(context) {
  const resolved = await resolveOwner(context);
  if (resolved.response) return resolved.response;
  try {
    const participants = await listSubmissionParticipants(context.env.COMPETITIONS_DB, resolved.submission.id);
    return json({ submissionId: resolved.submission.id, participants });
  } catch {
    return json({ error: "contributors_unavailable" }, 503);
  }
}

async function removeContributor(context, resolved, input) {
  const { session, competition, submission } = resolved;
  if (!canChangeParticipantRoster(competition.lifecycleState, "REMOVE")) {
    return json({ error: "contributor_roster_locked" }, 409);
  }
  const playerUuid = String(input?.playerUuid ?? "").trim().toLowerCase();
  if (!isCanonicalUuid(playerUuid)) return json({ error: "invalid_contributor" }, 400);
  try {
    const removed = await removeSubmissionContributor(context.env.COMPETITIONS_DB, {
      competitionId: competition.id,
      submissionId: submission.id,
      configVersion: competition.configVersion,
      playerUuid,
      actorSubject: session.subject,
      removedByUuid: submission.ownerUuid,
      removedAt: new Date().toISOString(),
      auditEventId: crypto.randomUUID()
    });
    if (!removed) return json({ error: "contributor_not_found" }, 404);
    return json({ status: "REMOVED", playerUuid });
  } catch {
    return json({ error: "contributor_remove_failed" }, 503);
  }
}

async function inviteContributor(context, resolved, input) {
  const { session, competition, submission } = resolved;
  if (!canChangeParticipantRoster(competition.lifecycleState, "ADD")) {
    return json({ error: "contributor_roster_locked" }, 409);
  }
  const role = input?.role;
  const minecraftName = typeof input?.minecraftName === "string" ? input.minecraftName.trim() : "";
  if (!roleAllowed(submission.entryType, role) || !/^[A-Za-z0-9_]{1,16}$/.test(minecraftName)) {
    return json({ error: "invalid_contributor_invite" }, 400);
  }

  try {
    const [target, participants] = await Promise.all([
      competitionPlayerLookup(context.env, minecraftName),
      listSubmissionParticipants(context.env.COMPETITIONS_DB, submission.id)
    ]);
    if (!target) return json({ error: "minecraft_player_not_found" }, 404);
    if (target.uuid === submission.ownerUuid) return json({ error: "owner_already_participant" }, 409);
    const existing = participants.find((participant) => participant.playerUuid === target.uuid);
    if (existing && existing.inviteStatus !== "DECLINED") {
      return json({ error: "contributor_already_listed" }, 409);
    }
    if (roleLimitReached(competition, participants, role)) {
      return json({ error: "contributor_role_limit_reached", role }, 409);
    }
    if (role !== "HELPER" && await isActiveCompetitionJudge(context.env.COMPETITIONS_DB, competition.id, target.uuid)) {
      return json({ error: "judge_can_only_be_helper" }, 409);
    }

    const invitedAt = new Date().toISOString();
    const notificationId = crypto.randomUUID();
    const invited = await inviteSubmissionContributor(context.env.COMPETITIONS_DB, {
      competitionId: competition.id,
      submissionId: submission.id,
      configVersion: competition.configVersion,
      playerUuid: target.uuid,
      playerName: target.name,
      role,
      roleLimit: participantRoleLimit(competition, role),
      invitedByUuid: submission.ownerUuid,
      actorSubject: session.subject,
      invitedAt,
      auditEventId: crypto.randomUUID(),
      notification: {
        id: notificationId,
        operationKey: `contributor-invite:${submission.id}:${target.uuid}:${invitedAt}`,
        payload: {
          competitionId: competition.id,
          competitionTitle: competition.title,
          competitionSlug: competition.slug,
          submissionId: submission.id,
          submissionTitle: submission.title,
          playerUuid: target.uuid,
          playerName: target.name,
          role
        }
      }
    });
    if (!invited) return json({ error: "contributor_already_listed" }, 409);
    return json({
      contributor: {
        playerUuid: target.uuid,
        playerName: target.name,
        role,
        inviteStatus: "PENDING",
        invitedAt
      }
    }, 201);
  } catch (error) {
    const message = String(error?.message ?? error);
    if (message.includes("competition_judge_cannot_enter")) return json({ error: "judge_can_only_be_helper" }, 409);
    if (message.includes("Competition bridge")) return json({ error: "competition_bridge_unavailable" }, 503);
    return json({ error: "contributor_invite_failed" }, 503);
  }
}

function contributorAction(context, resolved, input) {
  switch (input?.action) {
    case "INVITE":
      return inviteContributor(context, resolved, input);
    case "REMOVE":
      return removeContributor(context, resolved, input);
    default:
      return json({ error: "invalid_contributor_action" }, 400);
  }
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const resolved = await resolveOwner(context);
  if (resolved.response) return resolved.response;
  let input;
  try {
    input = await context.request.json();
  } catch {
    input = null;
  }
  return contributorAction(context, resolved, input);
}

export function onRequest() {
  return methodNotAllowed(["GET", "POST"]);
}

export { participantRoleLimit, roleAllowed, roleLimitReached, slugValue, submissionId };
