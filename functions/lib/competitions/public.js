import { publicCompetitionRewards } from "./reward-config.js";

const ENTRY_VISIBLE_STATES = new Set([
  "VOTING",
  "JUDGING",
  "RESULTS_READY",
  "COMPLETED",
  "ARCHIVED"
]);

function cloneCriteria(criteria) {
  if (!Array.isArray(criteria)) return [];
  return criteria.map((criterion) => ({
    id: criterion.id,
    label: criterion.label,
    maxScore: criterion.maxScore,
    weight: criterion.weight
  }));
}

function sectionOrEmpty(value) {
  return value ?? {};
}

function valueOrNull(value) {
  return value ?? null;
}

function valueOrEmpty(value) {
  return value ?? "";
}

function publicTextConfig(config) {
  return {
    summary: valueOrEmpty(config.summary),
    description: valueOrEmpty(config.description),
    rules: valueOrEmpty(config.rules)
  };
}

function publicAppearanceConfig(config) {
  return {
    bannerImageId: valueOrNull(config.bannerImageId),
    iconImageId: valueOrNull(config.iconImageId),
    categoryImageId: valueOrNull(config.categoryImageId),
    accent: valueOrNull(config.accent)
  };
}

function publicScheduleConfig(config) {
  return {
    submissionsOpenAt: valueOrNull(config.submissionsOpenAt),
    submissionsCloseAt: valueOrNull(config.submissionsCloseAt),
    reviewCloseAt: valueOrNull(config.reviewCloseAt),
    votingOpenAt: valueOrNull(config.votingOpenAt),
    votingCloseAt: valueOrNull(config.votingCloseAt),
    judgingOpenAt: valueOrNull(config.judgingOpenAt),
    judgingCloseAt: valueOrNull(config.judgingCloseAt)
  };
}

function publicEntriesConfig(config) {
  return {
    allowedTypes: Array.isArray(config.allowedTypes) ? [...config.allowedTypes] : [],
    maxEntriesPerPlayer: valueOrNull(config.maxEntriesPerPlayer),
    maxEntriesPerGuild: valueOrNull(config.maxEntriesPerGuild),
    minImages: valueOrNull(config.minImages),
    maxDescriptionChars: valueOrNull(config.maxDescriptionChars),
    coordinatesRequested: Boolean(config.coordinatesRequested),
    judgesCanViewCoordinates: Boolean(config.judgesCanViewCoordinates),
    maxMainMembers: valueOrNull(config.maxMainMembers),
    maxHelpers: valueOrNull(config.maxHelpers)
  };
}

function publicVotingConfig(config) {
  return {
    enabled: Boolean(config.enabled),
    votesPerVoter: valueOrNull(config.votesPerVoter),
    minimumActiveMinutes: valueOrNull(config.minimumActiveMinutes),
    allowChangesUntilClose: Boolean(config.allowChangesUntilClose)
  };
}

function publicJudgingConfig(config) {
  return {
    enabled: Boolean(config.enabled),
    criteria: cloneCriteria(config.criteria),
    communityWeight: valueOrNull(config.communityWeight),
    judgeWeight: valueOrNull(config.judgeWeight),
    tiebreakRule: valueOrNull(config.tiebreakRule),
    publicFeedbackOptional: Boolean(config.publicFeedbackOptional)
  };
}

function submissionMediaUrl(id) {
  return id ? `/api/competitions/submission-media/${id}` : null;
}

function publicSubmissionImage(image, coverImageId) {
  return {
    id: image.id,
    sortOrder: image.sortOrder,
    width: image.width,
    height: image.height,
    mimeType: image.mimeType,
    isCover: image.id === coverImageId,
    url: submissionMediaUrl(image.id)
  };
}

function publicParticipant(participant) {
  return {
    playerUuid: participant.playerUuid,
    playerName: participant.playerName,
    role: participant.role
  };
}

export function publicEntriesVisibleInState(state) {
  return ENTRY_VISIBLE_STATES.has(state);
}

export function publicCompetitionConfig(config = {}) {
  const publicConfig = sectionOrEmpty(config.public);
  const appearance = sectionOrEmpty(config.appearance);
  const schedule = sectionOrEmpty(config.schedule);
  const entries = sectionOrEmpty(config.entries);
  const voting = sectionOrEmpty(config.voting);
  const judging = sectionOrEmpty(config.judging);
  return {
    public: publicTextConfig(publicConfig),
    appearance: publicAppearanceConfig(appearance),
    schedule: publicScheduleConfig(schedule),
    entries: publicEntriesConfig(entries),
    voting: publicVotingConfig(voting),
    judging: publicJudgingConfig(judging),
    rewards: publicCompetitionRewards(config.rewards)
  };
}

export function publicCompetitionDetail(competition) {
  return {
    id: competition.id,
    slug: competition.slug,
    title: competition.title,
    category: competition.category,
    visibility: competition.visibility,
    lifecycleState: competition.lifecycleState,
    configVersion: competition.configVersion,
    publishedAt: competition.publishedAt ?? null,
    archivedAt: competition.archivedAt ?? null,
    config: publicCompetitionConfig(competition.config)
  };
}

export function publicSubmissionDetail(submission, participants = [], images = []) {
  const coverImageId = valueOrNull(submission.coverImageId);
  const publicImages = images.map((image) => publicSubmissionImage(image, coverImageId));
  return {
    id: submission.id,
    competitionId: submission.competitionId,
    entryType: submission.entryType,
    ownerUuid: submission.ownerUuid,
    ownerName: submission.ownerName,
    guildId: valueOrNull(submission.guildId),
    guildName: valueOrNull(submission.guildName),
    title: submission.title,
    description: submission.description,
    coverImageId,
    coverImageUrl: submissionMediaUrl(coverImageId),
    revision: submission.revision,
    staffEdited: Boolean(submission.staffEdited),
    submittedAt: valueOrNull(submission.submittedAt),
    approvedAt: valueOrNull(submission.approvedAt),
    images: publicImages,
    participants: participants.map(publicParticipant)
  };
}
