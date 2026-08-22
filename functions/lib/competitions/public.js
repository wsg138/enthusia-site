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

export function publicEntriesVisibleInState(state) {
  return ENTRY_VISIBLE_STATES.has(state);
}

export function publicCompetitionConfig(config = {}) {
  return {
    public: {
      summary: config.public?.summary ?? "",
      description: config.public?.description ?? "",
      rules: config.public?.rules ?? ""
    },
    appearance: {
      bannerImageId: config.appearance?.bannerImageId ?? null,
      accent: config.appearance?.accent ?? null
    },
    schedule: {
      submissionsOpenAt: config.schedule?.submissionsOpenAt ?? null,
      submissionsCloseAt: config.schedule?.submissionsCloseAt ?? null,
      reviewCloseAt: config.schedule?.reviewCloseAt ?? null,
      votingOpenAt: config.schedule?.votingOpenAt ?? null,
      votingCloseAt: config.schedule?.votingCloseAt ?? null,
      judgingOpenAt: config.schedule?.judgingOpenAt ?? null,
      judgingCloseAt: config.schedule?.judgingCloseAt ?? null
    },
    entries: {
      allowedTypes: Array.isArray(config.entries?.allowedTypes)
        ? [...config.entries.allowedTypes]
        : [],
      maxEntriesPerPlayer: config.entries?.maxEntriesPerPlayer ?? null,
      maxEntriesPerGuild: config.entries?.maxEntriesPerGuild ?? null,
      maxImages: config.entries?.maxImages ?? null,
      minImages: config.entries?.minImages ?? null,
      maxDescriptionChars: config.entries?.maxDescriptionChars ?? null,
      coordinatesRequested: Boolean(config.entries?.coordinatesRequested),
      judgesCanViewCoordinates: Boolean(config.entries?.judgesCanViewCoordinates),
      maxMainMembers: config.entries?.maxMainMembers ?? null,
      maxHelpers: config.entries?.maxHelpers ?? null
    },
    voting: {
      enabled: Boolean(config.voting?.enabled),
      votesPerVoter: config.voting?.votesPerVoter ?? null,
      minimumActiveMinutes: config.voting?.minimumActiveMinutes ?? null,
      allowChangesUntilClose: Boolean(config.voting?.allowChangesUntilClose)
    },
    judging: {
      enabled: Boolean(config.judging?.enabled),
      criteria: cloneCriteria(config.judging?.criteria),
      communityWeight: config.judging?.communityWeight ?? null,
      judgeWeight: config.judging?.judgeWeight ?? null,
      tiebreakRule: config.judging?.tiebreakRule ?? null,
      publicFeedbackOptional: Boolean(config.judging?.publicFeedbackOptional)
    }
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

export function publicSubmissionDetail(submission, participants = []) {
  return {
    id: submission.id,
    competitionId: submission.competitionId,
    entryType: submission.entryType,
    ownerUuid: submission.ownerUuid,
    ownerName: submission.ownerName,
    guildId: submission.guildId ?? null,
    guildName: submission.guildName ?? null,
    title: submission.title,
    description: submission.description,
    coverImageId: submission.coverImageId ?? null,
    revision: submission.revision,
    staffEdited: Boolean(submission.staffEdited),
    submittedAt: submission.submittedAt ?? null,
    approvedAt: submission.approvedAt ?? null,
    participants: participants.map((participant) => ({
      playerUuid: participant.playerUuid,
      playerName: participant.playerName,
      role: participant.role
    }))
  };
}
