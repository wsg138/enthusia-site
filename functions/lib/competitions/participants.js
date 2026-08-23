const ENTRY_TYPES = new Set(["SOLO", "GROUP", "GUILD"]);
const PARTICIPANT_ROLES = new Set(["OWNER", "MAIN", "HELPER", "GUILD_WORKER"]);

export function countsTowardPlayerEntryLimit(entryType, role) {
  if (!ENTRY_TYPES.has(entryType) || !PARTICIPANT_ROLES.has(role)) return false;
  if (entryType === "GUILD") return false;
  return role === "OWNER" || role === "MAIN";
}

export function judgeCanHoldParticipantRole(role) {
  return role === "HELPER";
}

export function canChangeParticipantRoster(lifecycleState, operation, { existingPendingInvite = false } = {}) {
  const beforeVoting = new Set(["DRAFT", "UPCOMING", "SUBMISSIONS_OPEN", "REVIEW"]);
  if (beforeVoting.has(lifecycleState)) {
    return operation === "ADD" || operation === "REMOVE" || operation === "ACCEPT" || operation === "DECLINE";
  }

  // Once voting begins the credited roster cannot be manipulated. A person who
  // was already invited may still accept/decline later, including after results.
  if ((operation === "ACCEPT" || operation === "DECLINE") && existingPendingInvite) {
    return lifecycleState !== "CANCELLED";
  }

  return false;
}

function acceptedBeforeRewards({ acceptedAt = null, rewardsDeliveredAt = null }) {
  if (!acceptedAt || !rewardsDeliveredAt) return true;
  const accepted = Date.parse(acceptedAt);
  const delivered = Date.parse(rewardsDeliveredAt);
  return !(Number.isFinite(accepted) && Number.isFinite(delivered) && accepted > delivered);
}

export function participantCanReceiveRewards({
  entryType,
  role,
  isAssignedJudge = false,
  acceptedAt = null,
  rewardsDeliveredAt = null
}) {
  if (!ENTRY_TYPES.has(entryType) || !PARTICIPANT_ROLES.has(role) || isAssignedJudge) return false;

  let roleEligible = false;
  if (entryType === "SOLO") roleEligible = role === "OWNER";
  if (entryType === "GROUP") roleEligible = role === "OWNER" || role === "MAIN" || role === "HELPER";
  if (entryType === "GUILD") roleEligible = role === "GUILD_WORKER" || role === "HELPER";
  if (!roleEligible) return false;

  return acceptedBeforeRewards({ acceptedAt, rewardsDeliveredAt });
}

export function participantRewardWeight({
  entryType,
  role,
  isAssignedJudge = false,
  acceptedAt = null,
  rewardsDeliveredAt = null,
  helperRewardMultiplier = 0.5
}) {
  if (!participantCanReceiveRewards({
    entryType,
    role,
    isAssignedJudge,
    acceptedAt,
    rewardsDeliveredAt
  })) return 0;

  if (role !== "HELPER") return 1;
  return typeof helperRewardMultiplier === "number"
    && Number.isFinite(helperRewardMultiplier)
    && helperRewardMultiplier >= 0
    && helperRewardMultiplier <= 1
    ? helperRewardMultiplier
    : 0.5;
}

export function canVoterVoteForSubmission({
  entryType,
  voterUuid,
  isAssignedJudge = false,
  acceptedParticipants = [],
  voterIsGuildMember = false
}) {
  if (!ENTRY_TYPES.has(entryType) || !voterUuid || isAssignedJudge) return false;

  if (entryType === "GUILD") {
    return !voterIsGuildMember;
  }

  const participant = acceptedParticipants.find((candidate) => candidate?.playerUuid === voterUuid);
  if (!participant) return true;

  // Helpers are deliberately allowed to vote for a project they helped with.
  return participant.role === "HELPER";
}

export function voterMeetsActivePlaytime(activeMinutes, requiredMinutes) {
  return Number.isFinite(activeMinutes)
    && Number.isInteger(requiredMinutes)
    && requiredMinutes >= 0
    && activeMinutes >= requiredMinutes;
}
