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

export function participantCanReceiveRewards({
  entryType,
  role,
  isAssignedJudge = false,
  acceptedAt = null,
  rewardsDeliveredAt = null
}) {
  if (!ENTRY_TYPES.has(entryType) || !PARTICIPANT_ROLES.has(role)) return false;
  if (isAssignedJudge || role === "HELPER") return false;
  if (entryType === "GUILD" && role !== "GUILD_WORKER") return false;
  if (entryType !== "GUILD" && role !== "OWNER" && role !== "MAIN") return false;

  if (acceptedAt && rewardsDeliveredAt) {
    const accepted = Date.parse(acceptedAt);
    const delivered = Date.parse(rewardsDeliveredAt);
    if (Number.isFinite(accepted) && Number.isFinite(delivered) && accepted > delivered) {
      return false;
    }
  }

  return true;
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
