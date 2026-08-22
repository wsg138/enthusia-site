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

const ENTRY_TYPES = new Set(["SOLO", "GROUP", "GUILD"]);
const TIEBREAK_RULES = new Set([
  "JUDGE_REVOTE",
  "HIGHEST_JUDGE_SCORE",
  "HIGHEST_COMMUNITY_SCORE",
  "MANUAL_STAFF"
]);

function cleanText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function boundedMultiline(value, max) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  return normalized.length <= max ? normalized : null;
}

function boundedInteger(value, min, max, fallback) {
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function optionalInteger(value, min, max) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function optionalNumber(value, min, max) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

function optionalTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function optionalIdentifier(value, max = 128) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= max && /^[A-Za-z0-9._:-]+$/.test(normalized)
    ? normalized
    : null;
}

function boolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
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

  const defaults = initialCompetitionConfig();
  const publicInput = input.public ?? {};
  const appearanceInput = input.appearance ?? {};
  const scheduleInput = input.schedule ?? {};
  const entriesInput = input.entries ?? {};
  const votingInput = input.voting ?? {};
  const judgingInput = input.judging ?? {};
  const moderationInput = input.moderation ?? {};

  const summary = boundedMultiline(publicInput.summary, SUMMARY_MAX);
  const description = boundedMultiline(publicInput.description, COMPETITION_DESCRIPTION_MAX);
  const rules = boundedMultiline(publicInput.rules, RULES_MAX);
  if (summary === null || description === null || rules === null) return null;

  const requestedTypes = Array.isArray(entriesInput.allowedTypes)
    ? entriesInput.allowedTypes.filter((type) => ENTRY_TYPES.has(type))
    : defaults.entries.allowedTypes;
  const allowedTypes = [...new Set(requestedTypes)];
  if (!allowedTypes.length || allowedTypes.length > ENTRY_TYPES.size) return null;

  const accent = appearanceInput.accent === null || appearanceInput.accent === undefined || appearanceInput.accent === ""
    ? null
    : typeof appearanceInput.accent === "string" && /^#[0-9A-Fa-f]{6}$/.test(appearanceInput.accent)
      ? appearanceInput.accent.toUpperCase()
      : null;
  if (appearanceInput.accent && !accent) return null;

  const bannerImageId = optionalIdentifier(appearanceInput.bannerImageId);
  if (appearanceInput.bannerImageId && !bannerImageId) return null;

  const guildSubmissionPermission = typeof entriesInput.guildSubmissionPermission === "string"
    && /^[a-z0-9._-]{3,64}$/i.test(entriesInput.guildSubmissionPermission.trim())
    ? entriesInput.guildSubmissionPermission.trim().toLowerCase()
    : defaults.entries.guildSubmissionPermission;

  const criteriaInput = Array.isArray(judgingInput.criteria) ? judgingInput.criteria : [];
  if (criteriaInput.length > MAX_CRITERIA) return null;
  const criteria = [];
  const criterionIds = new Set();
  for (const item of criteriaInput) {
    const id = optionalIdentifier(item?.id, 48);
    const label = cleanText(item?.label);
    const weight = optionalNumber(item?.weight, 0.000001, 1000);
    if (!id || criterionIds.has(id) || !label || label.length > 80 || weight === null) return null;
    if (item?.maxScore !== 10) return null;
    criterionIds.add(id);
    criteria.push({ id, label, maxScore: 10, weight });
  }

  const tiebreakRule = judgingInput.tiebreakRule === null || judgingInput.tiebreakRule === undefined || judgingInput.tiebreakRule === ""
    ? null
    : TIEBREAK_RULES.has(judgingInput.tiebreakRule)
      ? judgingInput.tiebreakRule
      : null;
  if (judgingInput.tiebreakRule && !tiebreakRule) return null;

  const maxMainMembers = optionalInteger(entriesInput.maxMainMembers, 1, MAX_TEAM_SIZE);
  if (entriesInput.maxMainMembers !== null && entriesInput.maxMainMembers !== undefined && entriesInput.maxMainMembers !== "" && maxMainMembers === null) return null;
  const maxHelpers = optionalInteger(entriesInput.maxHelpers, 0, MAX_TEAM_SIZE);
  if (entriesInput.maxHelpers !== null && entriesInput.maxHelpers !== undefined && entriesInput.maxHelpers !== "" && maxHelpers === null) return null;

  return {
    schemaVersion: 1,
    public: { summary, description, rules },
    appearance: { bannerImageId, accent },
    schedule: {
      submissionsOpenAt: optionalTimestamp(scheduleInput.submissionsOpenAt),
      submissionsCloseAt: optionalTimestamp(scheduleInput.submissionsCloseAt),
      reviewCloseAt: optionalTimestamp(scheduleInput.reviewCloseAt),
      votingOpenAt: optionalTimestamp(scheduleInput.votingOpenAt),
      votingCloseAt: optionalTimestamp(scheduleInput.votingCloseAt),
      judgingOpenAt: optionalTimestamp(scheduleInput.judgingOpenAt),
      judgingCloseAt: optionalTimestamp(scheduleInput.judgingCloseAt)
    },
    entries: {
      allowedTypes,
      maxEntriesPerPlayer: boundedInteger(entriesInput.maxEntriesPerPlayer, 1, 3, defaults.entries.maxEntriesPerPlayer),
      maxEntriesPerGuild: boundedInteger(entriesInput.maxEntriesPerGuild, 1, 10, defaults.entries.maxEntriesPerGuild),
      maxImages: boundedInteger(entriesInput.maxImages, 1, 8, defaults.entries.maxImages),
      minImages: boundedInteger(entriesInput.minImages, 1, 8, defaults.entries.minImages),
      maxDescriptionChars: boundedInteger(entriesInput.maxDescriptionChars, 2500, 10000, defaults.entries.maxDescriptionChars),
      coordinatesRequested: boolean(entriesInput.coordinatesRequested, defaults.entries.coordinatesRequested),
      judgesCanViewCoordinates: boolean(entriesInput.judgesCanViewCoordinates, defaults.entries.judgesCanViewCoordinates),
      maxMainMembers,
      maxHelpers,
      guildSubmissionPermission
    },
    voting: {
      enabled: boolean(votingInput.enabled, defaults.voting.enabled),
      votesPerVoter: boundedInteger(votingInput.votesPerVoter, 1, 20, defaults.voting.votesPerVoter),
      minimumActiveMinutes: boundedInteger(votingInput.minimumActiveMinutes, 0, MAX_ACTIVE_MINUTES, defaults.voting.minimumActiveMinutes),
      allowChangesUntilClose: boolean(votingInput.allowChangesUntilClose, defaults.voting.allowChangesUntilClose),
      showTotalsToStaff: true,
      showTotalsPublicWhileOpen: false,
      helpersCanVoteOwnEntry: true,
      guildMembersCanVoteOwnEntry: false,
      judgesCanVote: false
    },
    judging: {
      enabled: boolean(judgingInput.enabled, defaults.judging.enabled),
      allowNonStaffJudges: boolean(judgingInput.allowNonStaffJudges, defaults.judging.allowNonStaffJudges),
      publicFeedbackOptional: true,
      criteria,
      communityWeight: optionalNumber(judgingInput.communityWeight, 0, 100),
      judgeWeight: optionalNumber(judgingInput.judgeWeight, 0, 100),
      tiebreakRule
    },
    moderation: {
      requireStaffApproval: true,
      reviewGraceMinutes: boundedInteger(moderationInput.reviewGraceMinutes, 0, 10080, defaults.moderation.reviewGraceMinutes),
      openAIModeration: true,
      minecraftPrivacyReview: "MANUAL_STAFF"
    }
  };
}
