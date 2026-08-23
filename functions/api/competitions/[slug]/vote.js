import { competitionsEnabled, hasCompetitionDatabase } from "../../../lib/competitions/access.js";
import { isActiveCompetitionJudge } from "../../../lib/competitions/judges.js";
import {
  bridgeContextsForAllLinkedAccounts,
  getCompetitionParticipantSession,
  linkedMinecraftUuids,
  maxLinkedActiveMinutes
} from "../../../lib/competitions/participant-auth.js";
import { canVoterVoteForSubmission, voterMeetsActivePlaytime } from "../../../lib/competitions/participants.js";
import { authorizeCompetitionRead } from "../../../lib/competitions/public-access.js";
import {
  getPublicCompetitionBySlug,
  listAcceptedPublicParticipantsByCompetition,
  listApprovedPublicSubmissions
} from "../../../lib/competitions/repository.js";
import { getCompetitionBallot, replaceCompetitionBallot } from "../../../lib/competitions/voting.js";
import { json, methodNotAllowed, unauthorized } from "../../../lib/responses.js";
import { requireSameOrigin } from "../../../lib/security.js";
import { isCanonicalUuid } from "../../../lib/validation.js";

function slugValue(context) {
  const value = typeof context?.params?.slug === "string" ? context.params.slug.trim().toLowerCase() : "";
  return /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(value) ? value : null;
}

function groupParticipants(rows) {
  const grouped = new Map();
  for (const participant of rows) {
    if (!grouped.has(participant.submissionId)) grouped.set(participant.submissionId, []);
    grouped.get(participant.submissionId).push(participant);
  }
  return grouped;
}

function guildIds(context) {
  return new Set((context?.guilds ?? [])
    .map((guild) => String(guild?.guildId ?? guild?.id ?? "").trim())
    .filter(Boolean));
}

function allGuildIds(contexts) {
  const ids = new Set();
  for (const item of contexts ?? []) {
    for (const id of guildIds(item?.context)) ids.add(id);
  }
  return ids;
}

function votingWindowOpen(competition, now = Date.now()) {
  if (competition?.lifecycleState !== "VOTING" || !competition?.config?.voting?.enabled) return false;
  const openAt = Date.parse(competition.config?.schedule?.votingOpenAt ?? "");
  const closeAt = Date.parse(competition.config?.schedule?.votingCloseAt ?? "");
  return Number.isFinite(openAt) && Number.isFinite(closeAt) && now >= openAt && now < closeAt;
}

async function authenticatedCompetitionContext(context) {
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
  const readAuthorization = await authorizeCompetitionRead(context);
  if (readAuthorization.response) return { response: readAuthorization.response };
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
  if (!session.linkedMinecraftAccounts.length) return { response: json({ error: "minecraft_link_required" }, 403) };

  const slug = slugValue(context);
  if (!slug || slug === "admin") return { response: json({ error: "competition_not_found" }, 404) };

  try {
    const competition = await getPublicCompetitionBySlug(context.env.COMPETITIONS_DB, slug);
    if (!competition) return { response: json({ error: "competition_not_found" }, 404) };
    return { session, competition };
  } catch {
    return { response: json({ error: "competition_unavailable" }, 503) };
  }
}

async function eligibility(context, session, competition) {
  let linkedContexts;
  try {
    linkedContexts = await bridgeContextsForAllLinkedAccounts(context.env, session);
  } catch {
    return { error: "competition_bridge_unavailable", status: 503 };
  }
  if (!linkedContexts.length) return { error: "minecraft_link_required", status: 403 };

  const activeMinutes = maxLinkedActiveMinutes(linkedContexts);
  const requiredMinutes = competition.config?.voting?.minimumActiveMinutes ?? 0;
  if (!voterMeetsActivePlaytime(activeMinutes, requiredMinutes)) {
    return {
      error: "insufficient_active_playtime",
      status: 403,
      activeMinutes,
      requiredMinutes
    };
  }

  const linkedUuids = linkedMinecraftUuids(session);
  const judgeChecks = await Promise.all(linkedUuids.map((uuid) =>
    isActiveCompetitionJudge(context.env.COMPETITIONS_DB, competition.id, uuid)
  ));
  if (judgeChecks.some(Boolean)) return { error: "judges_cannot_vote", status: 403 };

  return {
    linkedContexts,
    linkedUuids,
    linkedUuidSet: new Set(linkedUuids),
    voterGuilds: allGuildIds(linkedContexts),
    activeMinutes,
    requiredMinutes
  };
}

export async function onRequestGet(context) {
  const resolved = await authenticatedCompetitionContext(context);
  if (resolved.response) return resolved.response;
  const { session, competition } = resolved;
  if (!votingWindowOpen(competition)) return json({ error: "voting_not_open" }, 409);

  let eligible;
  try {
    eligible = await eligibility(context, session, competition);
  } catch {
    return json({ error: "voting_eligibility_unavailable" }, 503);
  }
  if (eligible.error) return json(eligible, eligible.status);

  try {
    const ballot = await getCompetitionBallot(context.env.COMPETITIONS_DB, competition.id, session.subject);
    return json({
      competitionId: competition.id,
      votesPerVoter: competition.config.voting.votesPerVoter,
      allowChangesUntilClose: Boolean(competition.config.voting.allowChangesUntilClose),
      activeMinutes: eligible.activeMinutes,
      requiredActiveMinutes: eligible.requiredMinutes,
      selections: ballot.map((vote) => vote.submissionId)
    });
  } catch {
    return json({ error: "competition_ballot_unavailable" }, 503);
  }
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const resolved = await authenticatedCompetitionContext(context);
  if (resolved.response) return resolved.response;
  const { session, competition } = resolved;
  if (!votingWindowOpen(competition)) return json({ error: "voting_not_open" }, 409);

  let input;
  try {
    input = await context.request.json();
  } catch {
    input = null;
  }
  if (!Array.isArray(input?.submissionIds)) return json({ error: "invalid_ballot" }, 400);
  const submissionIds = input.submissionIds.map((value) => String(value ?? "").trim().toLowerCase());
  if (
    submissionIds.length > competition.config.voting.votesPerVoter
    || submissionIds.some((id) => !isCanonicalUuid(id))
    || new Set(submissionIds).size !== submissionIds.length
  ) {
    return json({ error: "invalid_ballot" }, 400);
  }

  let eligible;
  try {
    eligible = await eligibility(context, session, competition);
  } catch {
    return json({ error: "voting_eligibility_unavailable" }, 503);
  }
  if (eligible.error) return json(eligible, eligible.status);

  try {
    const existing = await getCompetitionBallot(context.env.COMPETITIONS_DB, competition.id, session.subject);
    if (existing.length && !competition.config.voting.allowChangesUntilClose) {
      return json({ error: "ballot_changes_disabled" }, 409);
    }

    const [submissions, participants] = await Promise.all([
      listApprovedPublicSubmissions(context.env.COMPETITIONS_DB, competition.id),
      listAcceptedPublicParticipantsByCompetition(context.env.COMPETITIONS_DB, competition.id)
    ]);
    const byId = new Map(submissions.map((submission) => [submission.id, submission]));
    const participantsBySubmission = groupParticipants(participants);

    for (const submissionId of submissionIds) {
      const submission = byId.get(submissionId);
      if (!submission) return json({ error: "ballot_entry_not_eligible", submissionId }, 409);
      const acceptedParticipants = participantsBySubmission.get(submission.id) ?? [];
      for (const voterUuid of eligible.linkedUuids) {
        const allowed = canVoterVoteForSubmission({
          entryType: submission.entryType,
          voterUuid,
          isAssignedJudge: false,
          acceptedParticipants,
          voterIsGuildMember: submission.entryType === "GUILD" && eligible.voterGuilds.has(String(submission.guildId ?? ""))
        });
        if (!allowed) return json({ error: "cannot_vote_for_entry", submissionId }, 409);
      }
    }

    const canonicalVoterUuid = eligible.linkedUuids.slice().sort()[0];
    const selections = await replaceCompetitionBallot(context.env.COMPETITIONS_DB, {
      competitionId: competition.id,
      voterSubject: session.subject,
      voterUuid: canonicalVoterUuid,
      submissionIds,
      updatedAt: new Date().toISOString()
    });
    return json({ competitionId: competition.id, selections });
  } catch (error) {
    const message = String(error?.message ?? error);
    if (message.includes("competition_vote_limit_reached")) return json({ error: "vote_limit_reached" }, 409);
    if (message.includes("competition_judge_cannot_vote")) return json({ error: "judges_cannot_vote" }, 403);
    if (message.includes("cannot_vote_own_entry")) return json({ error: "cannot_vote_for_entry" }, 409);
    return json({ error: "competition_ballot_update_failed" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET", "POST"]);
}

export { allGuildIds, groupParticipants, guildIds, slugValue, votingWindowOpen };
