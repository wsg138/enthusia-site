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

const CONFIG_SECTIONS = [
  "public",
  "appearance",
  "schedule",
  "entries",
  "voting",
  "judging",
  "rewards",
  "moderation"
];

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

function configSections(input) {
  const sections = {};
  for (const name of CONFIG_SECTIONS) {
    const section = input[name] ?? {};
    if (!section || typeof section !== "object" || Array.isArray(section)) return INVALID;
    sections[name] = section;
  }
  return sections;
}

function sanitizePublicConfig(input) {
  const summary = boundedMultiline(input.summary, SUMMARY_MAX);
  const description = boundedMultiline(input.description, COMPETITION_DESCRIPTION_MAX);
  const rules = boundedMultiline(input.rules, RULES_MAX);
  return invalid(summary, description, rules)
    ? INVALID
    : { summary, description, rules };
}

function sanitizeAccent(value) {
  if (!hasValue(value)) return null;
  if (typeof value !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(value)) return INVALID;
  return value.toUpperCase();
}

function sanitizeAppearance(input) {
  const bannerImageId = optionalIdentifier(input.bannerImageId);
  const iconImageId = optionalIdentifier(input.iconImageId);
  const categoryImageId = optionalIdentifier(input.categoryImageId);
  const accent = sanitizeAccent(input.accent);
  return invalid(bannerImageId, iconImageId, categoryImageId, accent)
    ? INVALID
    : { bannerImageId, iconImageId, categoryImageId, accent };
}

function sanitizeSchedule(input) {
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
    const value = optionalTimestamp(input[field]);
    if (value === INVALID) return INVALID;
    schedule[field] = value;
  }
  return schedule;
}

function sanitizeAllowedTypes(value, fallback) {
  const rawTypes = hasValue(value) ? value : fallback;
  if (!Array.isArray(rawTypes) || rawTypes.some((type) => !ENTRY_TYPES.has(type))) return INVALID;
  const allowedTypes = [...new Set(rawTypes)];
  return allowedTypes.length && allowedTypes.length <= ENTRY_TYPES.size ? allowedTypes : INVALID;
}

function sanitizeGuildPermission(value, fallback) {
  if (!hasValue(value)) return fallback;
  if (typeof value !== "string") return INVALID;
  const permission = value.trim();
  return /^[a-z0-9._-]{3,64}$/i.test(permission) ? permission.toLowerCase() : INVALID;
}

function sanitizeEntries(input, defaults) {
  const allowedTypes = sanitizeAllowedTypes(input.allowedTypes, defaults.allowedTypes);
  const maxEntriesPerPlayer = boundedInteger(input.maxEntriesPerPlayer, 1, 3, defaults.maxEntriesPerPlayer);
  const maxEntriesPerGuild = boundedInteger(input.maxEntriesPerGuild, 1, 10, defaults.maxEntriesPerGuild);
  const maxImages = boundedInteger(input.maxImages, 1, 8, defaults.maxImages);
  const minImages = boundedInteger(input.minImages, 1, 8, defaults.minImages);
  const maxDescriptionChars = boundedInteger(input.maxDescriptionChars, 2500, 10000, defaults.maxDescriptionChars);
  const maxMainMembers = optionalInteger(input.maxMainMembers, 1, MAX_TEAM_SIZE);
  const maxHelpers = optionalInteger(input.maxHelpers, 0, MAX_TEAM_SIZE);
  const coordinatesRequested = strictBoolean(input.coordinatesRequested, defaults.coordinatesRequested);
  const judgesCanViewCoordinates = strictBoolean(input.judgesCanViewCoordinates, defaults.judgesCanViewCoordinates);
  const guildSubmissionPermission = sanitizeGuildPermission(input.guildSubmissionPermission, defaults.guildSubmissionPermission);

  if (invalid(
    allowedTypes,
    maxEntriesPerPlayer,
    maxEntriesPerGuild,
    maxImages,
    minImages,
    maxDescriptionChars,
    maxMainMembers,
    maxHelpers,
    coordinatesRequested,
    judgesCanViewCoordinates,
    guildSubmissionPermission
  )) return INVALID;

  return {
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
  };
}

function sanitizeVoting(input, defaults) {
  const enabled = strictBoolean(input.enabled, defaults.enabled);
  const votesPerVoter = boundedInteger(input.votesPerVoter, 1, 20, defaults.votesPerVoter);
  const minimumActiveMinutes = boundedInteger(input.minimumActiveMinutes, 0, MAX_ACTIVE_MINUTES, defaults.minimumActiveMinutes);
  const allowChangesUntilClose = strictBoolean(input.allowChangesUntilClose, defaults.allowChangesUntilClose);
  const communityScoreMode = hasValue(input.communityScoreMode)
    ? input.communityScoreMode
    : defaults.communityScoreMode;

  if (invalid(enabled, votesPerVoter, minimumActiveMinutes, allowChangesUntilClose)) return INVALID;
  if (!COMMUNITY_SCORE_MODES.has(communityScoreMode)) return INVALID;

  return {
    enabled,
    votesPerVoter,
    minimumActiveMinutes,
    allowChangesUntilClose,
    communityScoreMode,
    showTotalsToStaff: true,
    showTotalsPublicWhileOpen: false,
    helpersCanVoteOwnEntry: true,
    guildMembersCanVoteOwnEntry: false,
    judgesCanVote: false
  };
}

function sanitizeCriterion(item, ids) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return INVALID;
  const id = optionalIdentifier(item.id, 48);
  const label = cleanText(item.label);
  const weight = optionalNumber(item.weight, 0.000001, 1000);
  if (id === INVALID || weight === INVALID || !id || ids.has(id)) return INVALID;
  if (!label || label.length > 80 || item.maxScore !== 10) return INVALID;
  ids.add(id);
  return { id, label, maxScore: 10, weight };
}

function sanitizeCriteria(value) {
  const input = hasValue(value) ? value : [];
  if (!Array.isArray(input) || input.length > MAX_CRITERIA) return INVALID;
  const criteria = [];
  const ids = new Set();
  for (const item of input) {
    const criterion = sanitizeCriterion(item, ids);
    if (criterion === INVALID) return INVALID;
    criteria.push(criterion);
  }
  return criteria;
}

function sanitizeTiebreakRule(value) {
  if (!hasValue(value)) return null;
  return TIEBREAK_RULES.has(value) ? value : INVALID;
}

function sanitizeJudging(input, defaults) {
  const enabled = strictBoolean(input.enabled, defaults.enabled);
  const allowNonStaffJudges = strictBoolean(input.allowNonStaffJudges, defaults.allowNonStaffJudges);
  const criteria = sanitizeCriteria(input.criteria);
  const communityWeight = optionalNumber(input.communityWeight, 0, 100);
  const judgeWeight = optionalNumber(input.judgeWeight, 0, 100);
  const tiebreakRule = sanitizeTiebreakRule(input.tiebreakRule);

  if (invalid(enabled, allowNonStaffJudges, criteria, communityWeight, judgeWeight, tiebreakRule)) {
    return INVALID;
  }
  return {
    enabled,
    allowNonStaffJudges,
    publicFeedbackOptional: true,
    criteria,
    communityWeight,
    judgeWeight,
    tiebreakRule
  };
}

function sanitizeModeration(input, defaults) {
  const reviewGraceMinutes = boundedInteger(input.reviewGraceMinutes, 0, 10080, defaults.reviewGraceMinutes);
  if (reviewGraceMinutes === INVALID) return INVALID;
  return {
    requireStaffApproval: true,
    reviewGraceMinutes,
    openAIModeration: true,
    minecraftPrivacyReview: "MANUAL_STAFF"
  };
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
  const sections = configSections(input);
  if (sections === INVALID) return null;

  const publicConfig = sanitizePublicConfig(sections.public);
  const appearance = sanitizeAppearance(sections.appearance);
  const schedule = sanitizeSchedule(sections.schedule);
  const entries = sanitizeEntries(sections.entries, defaults.entries);
  const voting = sanitizeVoting(sections.voting, defaults.voting);
  const judging = sanitizeJudging(sections.judging, defaults.judging);
  const rewards = sanitizeCompetitionRewards(sections.rewards);
  const moderation = sanitizeModeration(sections.moderation, defaults.moderation);
  if (invalid(publicConfig, appearance, schedule, entries, voting, judging, moderation) || !rewards) {
    return null;
  }

  return {
    schemaVersion: 1,
    public: publicConfig,
    appearance,
    schedule,
    entries,
    voting,
    judging,
    rewards,
    moderation
  };
}
