const STATES = new Set([
  "DRAFT",
  "UPCOMING",
  "SUBMISSIONS_OPEN",
  "REVIEW",
  "VOTING",
  "JUDGING",
  "RESULTS_READY",
  "COMPLETED",
  "ARCHIVED",
  "CANCELLED"
]);

const ENTRY_TYPES = new Set(["SOLO", "GROUP", "GUILD"]);

const TRANSITIONS = new Map([
  ["DRAFT", new Set(["UPCOMING", "CANCELLED"])],
  ["UPCOMING", new Set(["SUBMISSIONS_OPEN", "CANCELLED"])],
  ["SUBMISSIONS_OPEN", new Set(["REVIEW", "CANCELLED"])],
  ["REVIEW", new Set(["VOTING", "JUDGING", "RESULTS_READY", "CANCELLED"])],
  ["VOTING", new Set(["JUDGING", "RESULTS_READY", "CANCELLED"])],
  ["JUDGING", new Set(["RESULTS_READY", "CANCELLED"])],
  ["RESULTS_READY", new Set(["COMPLETED", "CANCELLED"])],
  ["COMPLETED", new Set(["ARCHIVED"])],
  ["ARCHIVED", new Set()],
  ["CANCELLED", new Set()]
]);

function timestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function addError(errors, code, message) {
  errors.push({ code, message });
}

function requiredTimestamp(errors, value, code, message) {
  const parsed = timestamp(value);
  if (parsed === null) addError(errors, code, message);
  return parsed;
}

function validateScheduleOrder(errors, submissionsOpen, submissionsClose, reviewClose) {
  if (submissionsOpen !== null && submissionsClose !== null && submissionsClose <= submissionsOpen) {
    addError(errors, "submission_schedule_invalid", "Submissions must close after they open.");
  }
  if (submissionsClose !== null && reviewClose !== null && reviewClose < submissionsClose) {
    addError(errors, "review_schedule_invalid", "Review/fix time cannot end before submissions close.");
  }
}

function validateBaseSchedule(errors, schedule) {
  const submissionsOpen = requiredTimestamp(
    errors,
    schedule.submissionsOpenAt,
    "submissions_open_missing",
    "Submission opening time is required."
  );
  const submissionsClose = requiredTimestamp(
    errors,
    schedule.submissionsCloseAt,
    "submissions_close_missing",
    "Submission closing time is required."
  );
  const reviewClose = requiredTimestamp(
    errors,
    schedule.reviewCloseAt,
    "review_close_missing",
    "Review/fix period closing time is required."
  );
  validateScheduleOrder(errors, submissionsOpen, submissionsClose, reviewClose);
  return { reviewClose };
}

function validateEntryTypeLimits(errors, entries, allowedTypes) {
  if (!allowedTypes.length || allowedTypes.some((type) => !ENTRY_TYPES.has(type))) {
    addError(errors, "entry_types_invalid", "At least one valid entry type is required.");
  }
  if (!positiveInteger(entries.maxEntriesPerPlayer)) {
    addError(errors, "player_entry_limit_invalid", "Player entry limit must be a positive integer.");
  }
  if (allowedTypes.includes("GUILD") && !positiveInteger(entries.maxEntriesPerGuild)) {
    addError(errors, "guild_entry_limit_invalid", "Guild entry limit must be a positive integer.");
  }
  if (allowedTypes.includes("GROUP") && !positiveInteger(entries.maxMainMembers)) {
    addError(errors, "group_main_limit_missing", "Group competitions must set a main-member limit.");
  }
}

function validateEntryContentLimits(errors, entries) {
  if (!positiveInteger(entries.maxImages) || entries.maxImages > 8) {
    addError(errors, "image_limit_invalid", "Image limit must be between 1 and 8.");
  }
  if (!positiveInteger(entries.minImages) || entries.minImages > entries.maxImages) {
    addError(errors, "minimum_images_invalid", "Minimum images must fit within the image limit.");
  }
  if (!positiveInteger(entries.maxDescriptionChars) || entries.maxDescriptionChars < 2500) {
    addError(errors, "description_limit_invalid", "Descriptions must allow at least 2500 characters.");
  }
}

function validateEntries(errors, entries) {
  const allowedTypes = Array.isArray(entries.allowedTypes) ? entries.allowedTypes : [];
  validateEntryTypeLimits(errors, entries, allowedTypes);
  validateEntryContentLimits(errors, entries);
  if (entries.judgesCanViewCoordinates && !entries.coordinatesRequested) {
    addError(errors, "judge_coordinates_without_locations", "Judges cannot view coordinates when submissions do not collect them.");
  }
}

function validateModeration(errors, moderation) {
  if (moderation.requireStaffApproval !== true) {
    addError(errors, "staff_review_required", "Staff approval must remain enabled.");
  }
  if (moderation.openAIModeration !== true) {
    addError(errors, "openai_moderation_required", "OpenAI moderation must remain enabled.");
  }
  if (!nonNegativeInteger(moderation.reviewGraceMinutes)) {
    addError(errors, "review_grace_invalid", "Review grace time must be zero or more minutes.");
  }
}

function validateVotingSchedule(errors, schedule, reviewClose) {
  const votingOpen = timestamp(schedule.votingOpenAt);
  const votingClose = timestamp(schedule.votingCloseAt);
  if (votingOpen === null || votingClose === null) {
    addError(errors, "voting_schedule_missing", "Voting start and end times are required when voting is enabled.");
    return;
  }
  if (reviewClose !== null && votingOpen < reviewClose) {
    addError(errors, "voting_before_review_close", "Voting cannot begin before the review/fix period ends.");
  }
  if (votingClose <= votingOpen) {
    addError(errors, "voting_schedule_invalid", "Voting must close after it opens.");
  }
}

function validateVotingPolicy(errors, voting) {
  if (!positiveInteger(voting.votesPerVoter)) {
    addError(errors, "votes_per_voter_invalid", "Votes per voter must be a positive integer.");
  }
  if (!nonNegativeInteger(voting.minimumActiveMinutes)) {
    addError(errors, "active_playtime_invalid", "Active-playtime requirement must be zero or more minutes.");
  }
  if (voting.judgesCanVote !== false) {
    addError(errors, "judges_cannot_vote", "Assigned judges cannot participate in public voting.");
  }
}

function validateVoting(errors, schedule, voting, reviewClose) {
  validateVotingSchedule(errors, schedule, reviewClose);
  validateVotingPolicy(errors, voting);
}

function validateJudgingSchedule(errors, schedule) {
  const judgingOpen = timestamp(schedule.judgingOpenAt);
  const judgingClose = timestamp(schedule.judgingCloseAt);
  if (judgingOpen === null || judgingClose === null) {
    addError(errors, "judging_schedule_missing", "Judging start and end times are required when judging is enabled.");
  } else if (judgingClose <= judgingOpen) {
    addError(errors, "judging_schedule_invalid", "Judging must close after it opens.");
  }
}

function validCriterion(criterion, ids) {
  const id = typeof criterion?.id === "string" ? criterion.id.trim() : "";
  const label = typeof criterion?.label === "string" ? criterion.label.trim() : "";
  if (!id || ids.has(id)) return false;
  if (!label || criterion.maxScore !== 10) return false;
  if (typeof criterion.weight !== "number" || criterion.weight <= 0) return false;
  ids.add(id);
  return true;
}

function validateJudgingCriteria(errors, criteria) {
  if (!Array.isArray(criteria) || !criteria.length) {
    addError(errors, "judging_criteria_missing", "At least one judging criterion is required.");
    return;
  }
  const ids = new Set();
  for (const criterion of criteria) {
    if (validCriterion(criterion, ids)) continue;
    addError(errors, "judging_criterion_invalid", "Judging criteria need unique IDs, labels, a 0–10 scale, and positive weights.");
    break;
  }
}

function validateJudging(errors, schedule, judging) {
  validateJudgingSchedule(errors, schedule);
  validateJudgingCriteria(errors, judging.criteria);
  if (!judging.tiebreakRule) {
    addError(errors, "tiebreak_rule_missing", "A tie-break rule must be selected before publishing.");
  }
}

function validCombinedWeights(judging) {
  const weights = [judging.communityWeight, judging.judgeWeight];
  return weights.every((weight) => typeof weight === "number" && weight >= 0)
    && weights[0] + weights[1] === 100;
}

function competitionSections(config) {
  return {
    schedule: config.schedule ?? {},
    entries: config.entries ?? {},
    voting: config.voting ?? {},
    judging: config.judging ?? {},
    moderation: config.moderation ?? {}
  };
}

export function isCompetitionState(value) {
  return STATES.has(value);
}

export function canTransitionCompetition(from, to, { automatic = false } = {}) {
  if (!STATES.has(from) || !STATES.has(to)) return false;
  if (!TRANSITIONS.get(from)?.has(to)) return false;

  // Results are never made public by a timer. Staff must explicitly review and
  // publish them after ties, abuse flags, disqualifications, and scores are final.
  if (automatic && to === "COMPLETED") return false;
  return true;
}

export function validatePublishableCompetitionConfig(config) {
  if (!config || typeof config !== "object") {
    return [{ code: "config_missing", message: "Competition configuration is missing." }];
  }
  const errors = [];
  const { schedule, entries, voting, judging, moderation } = competitionSections(config);
  const { reviewClose } = validateBaseSchedule(errors, schedule);
  validateEntries(errors, entries);
  validateModeration(errors, moderation);
  if (voting.enabled) {
    validateVoting(errors, schedule, voting, reviewClose);
  }
  if (judging.enabled) {
    validateJudging(errors, schedule, judging);
  }
  if (voting.enabled && judging.enabled && !validCombinedWeights(judging)) {
    addError(errors, "combined_weights_invalid", "Community and judge weights must total 100%.");
  }
  return errors;
}
