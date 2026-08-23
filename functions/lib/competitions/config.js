import { initialRewardConfig, sanitizeCompetitionRewards } from "./reward-config.js";

const TITLE_MIN = 3;
const TITLE_MAX = 100;
const CATEGORY_MAX = 48;
const SUMMARY_MAX = 500;
const SLUG_MAX = 80;
const COMPETITION_DESCRIPTION_MAX = 5000;
const RULES_MAX = 20000;
const MAX_CRITERIA = 20;
const MAX_TEAM_SIZE = 100;
const MAX_ACTIVE_MINUTES = 5_000_000;
const INVALID = Symbol("invalid");

const ENTRY_TYPES = new Set(["SOLO", "GROUP", "GUILD"]);
const COMMUNITY_SCORE_MODES = new Set(["BALLOT_APPROVAL_RATE"]);
const TIEBREAK_RULES = new Set([
  "JUDGE_REVOTE",
  "HIGHEST_JUDGE_SCORE",
  "HIGHEST_COMMUNITY_SCORE",
  "MANUAL_STAFF"
]);

function cleanText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function boundedMultiline(value, max) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") return INVALID;
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  return normalized.length <= max ? normalized : INVALID;
}

function boundedInteger(value, min, max, fallback) {
  if (!hasValue(value)) return fallback;
  return Number.isInteger(value) && value >= min && value <= max ? value : INVALID;
}

function optionalInteger(value, min, max) {
  if (!hasValue(value)) return null;
  return Number.isInteger(value) && value >= min && value <= max ? value : INVALID;
}

function optionalNumber(value, min, max) {
  if (!hasValue(value)) return null;
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value
    : INVALID;
}

function optionalTimestamp(value) {
  if (!hasValue(value)) return null;
  if (typeof value !== "string") return INVALID;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : INVALID;
}

function optionalIdentifier(value, max = 128) {
  if (!hasValue(value)) return null;
  if (typeof value !== "string") return INVALID;
  const normalized = value.trim();
  return normalized && normalized.length <= max && /^[A-Za-z0-9._:-]+$/.test(normalized)
    ? normalized
    : INVALID;
}

function strictBoolean(value, fallback) {
  if (value === null || value === undefined) return fallback;
  return typeof value === "boolean" ? value : INVALID;
}

function invalid(...values) {
  return values.some((value) => value === INVALID);
}

export function competitionSlug(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

export function sanitizeDraftCompetition(input) {
  const title = cleanText(input?.title);
  const category = cleanText(input?.category);
  const summary = typeof input?.summary === "string" ? input.summary.trim() : "";
  const requestedSlug = cleanText(input?.slug);
  const slug = competitionSlug(requestedSlug || title);

  if (title.length < TITLE_MIN || title.length > TITLE_MAX) return null;
  if (!category || category.length > CATEGORY_MAX) return null;
  if (summary.length > SUMMARY_MAX) return null;
  if (!slug || slug.length > SLUG_MAX) return null;

  return { title, category, summary, slug };
}

export function initialCompetitionConfig({ summary = "" } = {}) {
  return {
    schemaVersion: 1,
    public: {
      summary,
      description: "",
      rules: ""
    },
    appearance: {
      bannerImageId: null,
      iconImageId: null,
      categoryImageId: null,
      accent: null
    },
    schedule: {
      submissionsOpenAt: null,
      submissionsCloseAt: null,
      reviewCloseAt: null,
      votingOpenAt: null,
      votingCloseAt: null,
      judgingOpenAt: null,
      judgingCloseAt: null
    },
    entries: {
      allowedTypes: ["SOLO"],
      maxEntriesPerPlayer: 3,
      maxEntriesPerGuild: 1,
      maxImages: 8,
      minImages: 1,
      maxDescriptionChars: 2500,
      coordinatesRequested: false,
      judgesCanViewCoordinates: false,
      maxMainMembers: null,
      maxHelpers: null,
      guildSubmissionPermission: "competition.submit"
    },
    voting: {
      enabled: false,
      votesPerVoter: 3,
      minimumActiveMinutes: 120,
      allowChangesUntilClose: true,
      communityScoreMode: "BALLOT_APPROVAL_RATE",
      showTotalsToStaff: true,
      showTotalsPublicWhileOpen: false,
      helpersCanVoteOwnEntry: true,
      guildMembersCanVoteOwnEntry: false,
      judgesCanVote: false
    },
    judging: {
      enabled: false,
      allowNonStaffJudges: true,
      publicFeedbackOptional: true,
      criteria: [],
      communityWeight: null,
      judgeWeight: null,
      tiebreakRule: null
    },
    rewards: initialRewardConfig(),
    moderation: {
      requireStaffApproval: true,
      reviewGraceMinutes: 1440,
      openAIModeration: true,
      minecraftPrivacyReview: "MANUAL_STAFF"
    }
  };
}

export function sanitizeCompetitionConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (hasValue(input.schemaVersion) && input.schemaVersion !== 1) return null;

  const defaults = initialCompetitionConfig();
  const publicInput = input.public ?? {};
  const appearanceInput = input.appearance ?? {};
  const scheduleInput = input.schedule ?? {};
  const entriesInput = input.entries ?? {};
  const votingInput = input.voting ?? {};
  const judgingInput = input.judging ?? {};
  const rewardsInput = input.rewards ?? {};
  const moderationInput = input.moderation ?? {};

  for (const section of [publicInput, appearanceInput, scheduleInput, entriesInput, votingInput, judgingInput, rewardsInput, moderationInput]) {
    if (!section || typeof section !== "object" || Array.isArray(section)) return null;
  }

  const summary = boundedMultiline(publicInput.summary, SUMMARY_MAX);
  const description = boundedMultiline(publicInput.description, COMPETITION_DESCRIPTION_MAX);
  const rules = boundedMultiline(publicInput.rules, RULES_MAX);
  if (invalid(summary, description, rules)) return null;

  const rawTypes = hasValue(entriesInput.allowedTypes) ? entriesInput.allowedTypes : defaults.entries.allowedTypes;
  if (!Array.isArray(rawTypes) || rawTypes.some((type) => !ENTRY_TYPES.has(type))) return null;
  const allowedTypes = [...new Set(rawTypes)];
  if (!allowedTypes.length || allowedTypes.length > ENTRY_TYPES.size) return null;

  let accent = null;
  if (hasValue(appearanceInput.accent)) {
    if (typeof appearanceInput.accent !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(appearanceInput.accent)) return null;
    accent = appearanceInput.accent.toUpperCase();
  }

  const bannerImageId = optionalIdentifier(appearanceInput.bannerImageId);
  const iconImageId = optionalIdentifier(appearanceInput.iconImageId);
  const categoryImageId = optionalIdentifier(appearanceInput.categoryImageId);
  if (invalid(bannerImageId, iconImageId, categoryImageId)) return null;

  let guildSubmissionPermission = defaults.entries.guildSubmissionPermission;
  if (hasValue(entriesInput.guildSubmissionPermission)) {
    if (
      typeof entriesInput.guildSubmissionPermission !== "string"
      || !/^[a-z0-9._-]{3,64}$/i.test(entriesInput.guildSubmissionPermission.trim())
    ) return null;
    guildSubmissionPermission = entriesInput.guildSubmissionPermission.trim().toLowerCase();
  }

  const criteriaInput = hasValue(judgingInput.criteria) ? judgingInput.criteria : [];
  if (!Array.isArray(criteriaInput) || criteriaInput.length > MAX_CRITERIA) return null;
  const criteria = [];
  const criterionIds = new Set();
  for (const item of criteriaInput) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const id = optionalIdentifier(item.id, 48);
    const label = cleanText(item.label);
    const weight = optionalNumber(item.weight, 0.000001, 1000);
    if (id === INVALID || weight === INVALID || !id || criterionIds.has(id) || !label || label.length > 80) return null;
    if (item.maxScore !== 10) return null;
    criterionIds.add(id);
    criteria.push({ id, label, maxScore: 10, weight });
  }

  let tiebreakRule = null;
  if (hasValue(judgingInput.tiebreakRule)) {
    if (!TIEBREAK_RULES.has(judgingInput.tiebreakRule)) return null;
    tiebreakRule = judgingInput.tiebreakRule;
  }

  const schedule = {};
  for (const field of [
    "submissionsOpenAt",
    "submissionsCloseAt",
    "reviewCloseAt",
    "votingOpenAt",
    "votingCloseAt",
    "judgingOpenAt",
    "judgingCloseAt"
  ]) {
    const value = optionalTimestamp(scheduleInput[field]);
    if (value === INVALID) return null;
    schedule[field] = value;
  }

  const maxEntriesPerPlayer = boundedInteger(entriesInput.maxEntriesPerPlayer, 1, 3, defaults.entries.maxEntriesPerPlayer);
  const maxEntriesPerGuild = boundedInteger(entriesInput.maxEntriesPerGuild, 1, 10, defaults.entries.maxEntriesPerGuild);
  const maxImages = boundedInteger(entriesInput.maxImages, 1, 8, defaults.entries.maxImages);
  const minImages = boundedInteger(entriesInput.minImages, 1, 8, defaults.entries.minImages);
  const maxDescriptionChars = boundedInteger(entriesInput.maxDescriptionChars, 2500, 10000, defaults.entries.maxDescriptionChars);
  const maxMainMembers = optionalInteger(entriesInput.maxMainMembers, 1, MAX_TEAM_SIZE);
  const maxHelpers = optionalInteger(entriesInput.maxHelpers, 0, MAX_TEAM_SIZE);
  const coordinatesRequested = strictBoolean(entriesInput.coordinatesRequested, defaults.entries.coordinatesRequested);
  const judgesCanViewCoordinates = strictBoolean(entriesInput.judgesCanViewCoordinates, defaults.entries.judgesCanViewCoordinates);

  const votingEnabled = strictBoolean(votingInput.enabled, defaults.voting.enabled);
  const votesPerVoter = boundedInteger(votingInput.votesPerVoter, 1, 20, defaults.voting.votesPerVoter);
  const minimumActiveMinutes = boundedInteger(votingInput.minimumActiveMinutes, 0, MAX_ACTIVE_MINUTES, defaults.voting.minimumActiveMinutes);
  const allowChangesUntilClose = strictBoolean(votingInput.allowChangesUntilClose, defaults.voting.allowChangesUntilClose);
  const communityScoreMode = hasValue(votingInput.communityScoreMode)
    ? votingInput.communityScoreMode
    : defaults.voting.communityScoreMode;
  if (!COMMUNITY_SCORE_MODES.has(communityScoreMode)) return null;

  const judgingEnabled = strictBoolean(judgingInput.enabled, defaults.judging.enabled);
  const allowNonStaffJudges = strictBoolean(judgingInput.allowNonStaffJudges, defaults.judging.allowNonStaffJudges);
  const communityWeight = optionalNumber(judgingInput.communityWeight, 0, 100);
  const judgeWeight = optionalNumber(judgingInput.judgeWeight, 0, 100);
  const reviewGraceMinutes = boundedInteger(moderationInput.reviewGraceMinutes, 0, 10080, defaults.moderation.reviewGraceMinutes);
  const rewards = sanitizeCompetitionRewards(rewardsInput);

  if (invalid(
    maxEntriesPerPlayer,
    maxEntriesPerGuild,
    maxImages,
    minImages,
    maxDescriptionChars,
    maxMainMembers,
    maxHelpers,
    coordinatesRequested,
    judgesCanViewCoordinates,
    votingEnabled,
    votesPerVoter,
    minimumActiveMinutes,
    allowChangesUntilClose,
    judgingEnabled,
    allowNonStaffJudges,
    communityWeight,
    judgeWeight,
    reviewGraceMinutes
  ) || !rewards) return null;

  return {
    schemaVersion: 1,
    public: { summary, description, rules },
    appearance: { bannerImageId, iconImageId, categoryImageId, accent },
    schedule,
    entries: {
      allowedTypes,
      maxEntriesPerPlayer,
      maxEntriesPerGuild,
      maxImages,
      minImages,
      maxDescriptionChars,
      coordinatesRequested,
      judgesCanViewCoordinates,
      maxMainMembers,
      maxHelpers,
      guildSubmissionPermission
    },
    voting: {
      enabled: votingEnabled,
      votesPerVoter,
      minimumActiveMinutes,
      allowChangesUntilClose,
      communityScoreMode,
      showTotalsToStaff: true,
      showTotalsPublicWhileOpen: false,
      helpersCanVoteOwnEntry: true,
      guildMembersCanVoteOwnEntry: false,
      judgesCanVote: false
    },
    judging: {
      enabled: judgingEnabled,
      allowNonStaffJudges,
      publicFeedbackOptional: true,
      criteria,
      communityWeight,
      judgeWeight,
      tiebreakRule
    },
    rewards,
    moderation: {
      requireStaffApproval: true,
      reviewGraceMinutes,
      openAIModeration: true,
      minecraftPrivacyReview: "MANUAL_STAFF"
    }
  };
}
