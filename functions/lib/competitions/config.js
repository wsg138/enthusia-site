const TITLE_MIN = 3;
const TITLE_MAX = 100;
const CATEGORY_MAX = 48;
const SUMMARY_MAX = 500;
const SLUG_MAX = 80;

function cleanText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
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
