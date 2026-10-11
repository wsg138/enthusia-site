import {
  aggregateJudgeScores,
  combineCompetitionComponents,
  createResultSnapshot
} from "./scoring.js";

export const COMMUNITY_SCORE_MODE = "BALLOT_APPROVAL_RATE";

function round6(value) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function communityComponentFromVotes({
  voteCount,
  ballotCount,
  mode = COMMUNITY_SCORE_MODE
}) {
  if (mode !== COMMUNITY_SCORE_MODE)
    throw new TypeError("Unsupported community scoring mode");
  if (!Number.isInteger(voteCount) || voteCount < 0)
    throw new TypeError("Vote count is invalid");
  if (!Number.isInteger(ballotCount) || ballotCount < 0)
    throw new TypeError("Ballot count is invalid");
  if (ballotCount === 0) return 0;
  return round6(Math.min(10, (voteCount / ballotCount) * 10));
}

function scoreGroupKey(value) {
  return round6(value).toFixed(6);
}

function tiebreakComparator(rule) {
  if (rule === "HIGHEST_JUDGE_SCORE") {
    return (left, right) =>
      (right.judgeComponent ?? -1) - (left.judgeComponent ?? -1);
  }
  if (rule === "HIGHEST_COMMUNITY_SCORE") {
    return (left, right) =>
      (right.communityComponent ?? -1) - (left.communityComponent ?? -1);
  }
  return () => 0;
}

function tieOrderValue(tieOrder, submissionId) {
  if (!tieOrder || typeof tieOrder !== "object" || Array.isArray(tieOrder))
    return null;
  const value = tieOrder[submissionId];
  return Number.isInteger(value) && value >= 1 ? value : null;
}

const AUTOMATIC_TIEBREAK_METRICS = new Map([
  ["HIGHEST_JUDGE_SCORE", "judgeComponent"],
  ["HIGHEST_COMMUNITY_SCORE", "communityComponent"]
]);

function automaticTiebreakResolves(sorted, rule) {
  const metric = AUTOMATIC_TIEBREAK_METRICS.get(rule);
  if (!metric) return false;
  const buckets = new Map();
  for (const entry of sorted) {
    const key = entry[metric] === null ? "null" : scoreGroupKey(entry[metric]);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(entry);
  }
  return ![...buckets.values()].some((bucket) => bucket.length > 1);
}

function manualTieGroup(group, sorted, tieOrder) {
  const ordered = group.map((entry) => ({
    entry,
    order: tieOrderValue(tieOrder, entry.submissionId)
  }));
  if (
    ordered.some((item) => item.order === null) ||
    new Set(ordered.map((item) => item.order)).size !== ordered.length
  ) {
    return {
      resolved: sorted,
      unresolved: group.map((entry) => entry.submissionId).sort()
    };
  }
  ordered.sort(
    (left, right) =>
      left.order - right.order ||
      left.entry.submissionId.localeCompare(right.entry.submissionId)
  );
  return { resolved: ordered.map((item) => item.entry), unresolved: [] };
}

function resolveTieGroup(group, rule, tieOrder) {
  const comparator = tiebreakComparator(rule);
  const sorted = [...group].sort(
    (left, right) =>
      comparator(left, right) ||
      left.submissionId.localeCompare(right.submissionId)
  );
  if (automaticTiebreakResolves(sorted, rule))
    return { resolved: sorted, unresolved: [] };
  return manualTieGroup(group, sorted, tieOrder);
}

function judgeEvidence(scores) {
  return scores.map((score) => ({
    judgeUuid: score.judgeUuid,
    computedScore: score.computedScore,
    criteria: score.criteria,
    bonusPoints: score.bonusPoints,
    publicFeedback:
      typeof score.publicFeedback === "string" && score.publicFeedback.trim()
        ? score.publicFeedback.trim()
        : null
  }));
}

function submissionVotes(submission, context) {
  if (!context.votingEnabled) return { voteCount: 0, communityComponent: null };
  const voteCount = context.voteMap.get(submission.id) ?? 0;
  const communityComponent = communityComponentFromVotes({
    voteCount,
    ballotCount: context.ballotCount,
    mode: context.config.voting.communityScoreMode ?? COMMUNITY_SCORE_MODE
  });
  return { voteCount, communityComponent };
}

function submissionJudges(submission, context) {
  const scores = context.judgingEnabled
    ? (context.judgeMap.get(submission.id) ?? [])
    : [];
  const currentScores = scores.filter(
    (score) => Number(score.configVersion) === context.configVersion
  );
  if (
    context.judgingEnabled &&
    currentScores.length !== context.activeJudgeCount
  ) {
    context.readinessErrors.push(
      `judge_scores_incomplete:${submission.id}:${currentScores.length}/${context.activeJudgeCount}`
    );
  }
  const judgeComponent = context.judgingEnabled
    ? aggregateJudgeScores(
        currentScores.map((score) => Number(score.computedScore))
      )
    : null;
  return { currentScores, judgeComponent };
}

function computeSubmissionScore(submission, context) {
  const { voteCount, communityComponent } = submissionVotes(
    submission,
    context
  );
  const { currentScores, judgeComponent } = submissionJudges(
    submission,
    context
  );
  const componentResult = combineCompetitionComponents({
    votingEnabled: context.votingEnabled,
    judgingEnabled: context.judgingEnabled,
    communityComponent,
    judgeComponent:
      context.judgingEnabled && judgeComponent === null ? 0 : judgeComponent,
    communityWeight: context.config?.judging?.communityWeight,
    judgeWeight: context.config?.judging?.judgeWeight
  });
  return {
    submissionId: submission.id,
    title: submission.title,
    finalScore: componentResult.finalScore,
    communityComponent: componentResult.communityComponent,
    judgeComponent: componentResult.judgeComponent,
    voteCount,
    ballotCount: context.ballotCount,
    judgeScoreCount: currentScores.length,
    componentResult,
    judgeEvidence: judgeEvidence(currentScores)
  };
}

function scoreGroups(computed) {
  const groups = [];
  for (let index = 0; index < computed.length; ) {
    const key = scoreGroupKey(computed[index].finalScore);
    const group = [];
    while (
      index < computed.length &&
      scoreGroupKey(computed[index].finalScore) === key
    ) {
      group.push(computed[index]);
      index += 1;
    }
    groups.push(group);
  }
  return groups;
}

function orderStandings(computed, config, tieOrder) {
  computed.sort(
    (left, right) =>
      right.finalScore - left.finalScore ||
      left.submissionId.localeCompare(right.submissionId)
  );
  const finalOrder = [],
    unresolvedTies = [];
  for (const group of scoreGroups(computed)) {
    if (group.length === 1) {
      finalOrder.push(group[0]);
      continue;
    }
    const resolved = resolveTieGroup(
      group,
      config?.judging?.tiebreakRule ?? "MANUAL_STAFF",
      tieOrder
    );
    finalOrder.push(...resolved.resolved);
    if (resolved.unresolved.length) unresolvedTies.push(resolved.unresolved);
  }
  return { finalOrder, unresolvedTies };
}

function validateStandingsIdentity(input) {
  if (
    !input.competitionId ||
    !Number.isInteger(input.configVersion) ||
    input.configVersion < 1
  ) {
    throw new TypeError("Competition standings identity is invalid");
  }
  if (!Array.isArray(input.submissions) || !input.submissions.length) {
    throw new TypeError("At least one approved submission is required");
  }
}

function scoringModes(config) {
  const votingEnabled = Boolean(config?.voting?.enabled);
  const judgingEnabled = Boolean(config?.judging?.enabled);
  if (!votingEnabled && !judgingEnabled)
    throw new TypeError("Competition has no scoring component");
  return { votingEnabled, judgingEnabled };
}

function groupedJudgeScores(judgeScores) {
  const map = new Map();
  for (const score of judgeScores) {
    if (!map.has(score.submissionId)) map.set(score.submissionId, []);
    map.get(score.submissionId).push(score);
  }
  return map;
}

function initialReadinessErrors(judgingEnabled, activeJudgeCount) {
  return judgingEnabled &&
    (!Number.isInteger(activeJudgeCount) || activeJudgeCount < 1)
    ? ["no_active_judges"]
    : [];
}

function scoreContext(input) {
  const {
    competitionId,
    configVersion,
    config,
    submissions,
    voteTotals = [],
    ballotCount = 0,
    judgeScores = [],
    activeJudgeCount = 0,
    tieOrder = null
  } = input;
  validateStandingsIdentity(input);
  const { votingEnabled, judgingEnabled } = scoringModes(config);
  return {
    competitionId,
    configVersion,
    config,
    submissions,
    ballotCount,
    activeJudgeCount,
    tieOrder,
    votingEnabled,
    judgingEnabled,
    voteMap: new Map(
      voteTotals.map((row) => [row.submissionId, Number(row.voteCount ?? 0)])
    ),
    judgeMap: groupedJudgeScores(judgeScores),
    readinessErrors: initialReadinessErrors(judgingEnabled, activeJudgeCount)
  };
}

function communitySnapshotEvidence(entry, context) {
  if (!context.votingEnabled) return null;
  return {
    scoringMode:
      context.config.voting.communityScoreMode ?? COMMUNITY_SCORE_MODE,
    rawWholeNumberPoints: entry.voteCount,
    ballotCount: entry.ballotCount
  };
}

function judgeSnapshotEvidence(entry, context) {
  if (!context.judgingEnabled) return null;
  return {
    activeJudgeCount: context.activeJudgeCount,
    completedJudgeCount: entry.judgeScoreCount,
    scorecards: entry.judgeEvidence
  };
}

function standingEntry(entry, index, context, unresolvedTies) {
  const snapshot = createResultSnapshot({
    competitionId: context.competitionId,
    submissionId: entry.submissionId,
    configVersion: context.configVersion,
    componentResult: entry.componentResult,
    communityEvidence: communitySnapshotEvidence(entry, context),
    judgeEvidence: judgeSnapshotEvidence(entry, context),
    tiebreak: {
      rule: context.config?.judging?.tiebreakRule ?? "MANUAL_STAFF",
      resolved: !unresolvedTies.some((group) =>
        group.includes(entry.submissionId)
      )
    }
  });
  return {
    submissionId: entry.submissionId,
    title: entry.title,
    placement: index + 1,
    finalScore: entry.finalScore,
    communityComponent: entry.communityComponent,
    judgeComponent: entry.judgeComponent,
    voteCount: entry.voteCount,
    ballotCount: entry.ballotCount,
    judgeScoreCount: entry.judgeScoreCount,
    snapshot
  };
}

export function buildCompetitionStandings(input) {
  const context = scoreContext(input);
  const computed = context.submissions.map((submission) =>
    computeSubmissionScore(submission, context)
  );
  if (context.readinessErrors.length) {
    return {
      ready: false,
      errors: [...new Set(context.readinessErrors)],
      standings: [],
      unresolvedTies: []
    };
  }
  const { finalOrder, unresolvedTies } = orderStandings(
    computed,
    context.config,
    context.tieOrder
  );
  const standings = finalOrder.map((entry, index) =>
    standingEntry(entry, index, context, unresolvedTies)
  );
  return {
    ready: unresolvedTies.length === 0,
    errors: unresolvedTies.length ? ["tiebreak_required"] : [],
    standings,
    unresolvedTies
  };
}
