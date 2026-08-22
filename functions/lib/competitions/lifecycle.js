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
  const errors = [];
  if (!config || typeof config !== "object") {
    return [{ code: "config_missing", message: "Competition configuration is missing." }];
  }

  const schedule = config.schedule ?? {};
  const entries = config.entries ?? {};
  const voting = config.voting ?? {};
  const judging = config.judging ?? {};
  const moderation = config.moderation ?? {};

  const submissionsOpen = timestamp(schedule.submissionsOpenAt);
  const submissionsClose = timestamp(schedule.submissionsCloseAt);
  const reviewClose = timestamp(schedule.reviewCloseAt);

  if (submissionsOpen === null) {
    addError(errors, "submissions_open_missing", "Submission opening time is required.");
  }
  if (submissionsClose === null) {
    addError(errors, "submissions_close_missing", "Submission closing time is required.");
  }
  if (reviewClose === null) {
    addError(errors, "review_close_missing", "Review/fix period closing time is required.");
  }
  if (submissionsOpen !== null && submissionsClose !== null && submissionsClose <= submissionsOpen) {
    addError(errors, "submission_schedule_invalid", "Submissions must close after they open.");
  }
  if (submissionsClose !== null && reviewClose !== null && reviewClose < submissionsClose) {
    addError(errors, "review_schedule_invalid", "Review/fix time cannot end before submissions close.");
  }

  const allowedTypes = Array.isArray(entries.allowedTypes) ? entries.allowedTypes : [];
  const validEntryTypes = new Set(["SOLO", "GROUP", "GUILD"]);
  if (!allowedTypes.length || allowedTypes.some((type) => !validEntryTypes.has(type))) {
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
  if (!positiveInteger(entries.maxImages) || entries.maxImages > 8) {
    addError(errors, "image_limit_invalid", "Image limit must be between 1 and 8.");
  }
  if (!positiveInteger(entries.minImages) || entries.minImages > entries.maxImages) {
    addError(errors, "minimum_images_invalid", "Minimum images must fit within the image limit.");
  }
  if (!positiveInteger(entries.maxDescriptionChars) || entries.maxDescriptionChars < 2500) {
    addError(errors, "description_limit_invalid", "Descriptions must allow at least 2500 characters.");
  }
  if (entries.judgesCanViewCoordinates && !entries.coordinatesRequested) {
    addError(errors, "judge_coordinates_without_locations", "Judges cannot view coordinates when submissions do not collect them.");
  }

  if (moderation.requireStaffApproval !== true) {
    addError(errors, "staff_review_required", "Staff approval must remain enabled.");
  }
  if (moderation.openAIModeration !== true) {
    addError(errors, "openai_moderation_required", "OpenAI moderation must remain enabled.");
  }
  if (!nonNegativeInteger(moderation.reviewGraceMinutes)) {
    addError(errors, "review_grace_invalid", "Review grace time must be zero or more minutes.");
  }

  if (voting.enabled) {
    const votingOpen = timestamp(schedule.votingOpenAt);
    const votingClose = timestamp(schedule.votingCloseAt);
    if (votingOpen === null || votingClose === null) {
      addError(errors, "voting_schedule_missing", "Voting start and end times are required when voting is enabled.");
    } else {
      if (reviewClose !== null && votingOpen < reviewClose) {
        addError(errors, "voting_before_review_close", "Voting cannot begin before the review/fix period ends.");
      }
      if (votingClose <= votingOpen) {
        addError(errors, "voting_schedule_invalid", "Voting must close after it opens.");
      }
    }
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

  if (judging.enabled) {
    const judgingOpen = timestamp(schedule.judgingOpenAt);
    const judgingClose = timestamp(schedule.judgingCloseAt);
    if (judgingOpen === null || judgingClose === null) {
      addError(errors, "judging_schedule_missing", "Judging start and end times are required when judging is enabled.");
    } else if (judgingClose <= judgingOpen) {
      addError(errors, "judging_schedule_invalid", "Judging must close after it opens.");
    }

    if (!Array.isArray(judging.criteria) || !judging.criteria.length) {
      addError(errors, "judging_criteria_missing", "At least one judging criterion is required.");
    } else {
      const ids = new Set();
      for (const criterion of judging.criteria) {
        const id = typeof criterion?.id === "string" ? criterion.id.trim() : "";
        const label = typeof criterion?.label === "string" ? criterion.label.trim() : "";
        if (!id || ids.has(id) || !label || criterion.maxScore !== 10 || typeof criterion.weight !== "number" || criterion.weight <= 0) {
          addError(errors, "judging_criterion_invalid", "Judging criteria need unique IDs, labels, a 0–10 scale, and positive weights.");
          break;
        }
        ids.add(id);
      }
    }

    if (!judging.tiebreakRule) {
      addError(errors, "tiebreak_rule_missing", "A tie-break rule must be selected before publishing.");
    }
  }

  if (voting.enabled && judging.enabled) {
    if (
      typeof judging.communityWeight !== "number" ||
      typeof judging.judgeWeight !== "number" ||
      judging.communityWeight < 0 ||
      judging.judgeWeight < 0 ||
      judging.communityWeight + judging.judgeWeight !== 100
    ) {
      addError(errors, "combined_weights_invalid", "Community and judge weights must total 100%." );
    }
  }

  return errors;
}
