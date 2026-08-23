import {
  aggregateJudgeScores,
  combineCompetitionComponents,
  createResultSnapshot
} from "./scoring.js";

export const COMMUNITY_SCORE_MODE = "BALLOT_APPROVAL_RATE";

function round6(value) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function communityComponentFromVotes({ voteCount, ballotCount, mode = COMMUNITY_SCORE_MODE }) {
  if (mode !== COMMUNITY_SCORE_MODE) throw new TypeError("Unsupported community scoring mode");
  if (!Number.isInteger(voteCount) || voteCount < 0) throw new TypeError("Vote count is invalid");
  if (!Number.isInteger(ballotCount) || ballotCount < 0) throw new TypeError("Ballot count is invalid");
  if (ballotCount === 0) return 0;
  return round6(Math.min(10, (voteCount / ballotCount) * 10));
}

function scoreGroupKey(value) {
  return round6(value).toFixed(6);
}

function tiebreakComparator(rule) {
  if (rule === "HIGHEST_JUDGE_SCORE") {
    return (left, right) => (right.judgeComponent ?? -1) - (left.judgeComponent ?? -1);
  }
  if (rule === "HIGHEST_COMMUNITY_SCORE") {
    return (left, right) => (right.communityComponent ?? -1) - (left.communityComponent ?? -1);
  }
  return () => 0;
}

function tieOrderValue(tieOrder, submissionId) {
  if (!tieOrder || typeof tieOrder !== "object" || Array.isArray(tieOrder)) return null;
  const value = tieOrder[submissionId];
  return Number.isInteger(value) && value >= 1 ? value : null;
}

function resolveTieGroup(group, rule, tieOrder) {
  const comparator = tiebreakComparator(rule);
  const sorted = [...group].sort((left, right) => comparator(left, right) || left.submissionId.localeCompare(right.submissionId));

  if (rule === "HIGHEST_JUDGE_SCORE" || rule === "HIGHEST_COMMUNITY_SCORE") {
    const metric = rule === "HIGHEST_JUDGE_SCORE" ? "judgeComponent" : "communityComponent";
    const unresolvedBuckets = new Map();
    for (const entry of sorted) {
      const key = entry[metric] === null ? "null" : scoreGroupKey(entry[metric]);
      if (!unresolvedBuckets.has(key)) unresolvedBuckets.set(key, []);
      unresolvedBuckets.get(key).push(entry);
    }
    const hasResidualTie = [...unresolvedBuckets.values()].some((bucket) => bucket.length > 1);
    if (!hasResidualTie) return { resolved: sorted, unresolved: [] };
  }

  const ordered = group.map((entry) => ({ entry, order: tieOrderValue(tieOrder, entry.submissionId) }));
  if (ordered.some((item) => item.order === null) || new Set(ordered.map((item) => item.order)).size !== ordered.length) {
    return { resolved: sorted, unresolved: group.map((entry) => entry.submissionId).sort() };
  }
  ordered.sort((left, right) => left.order - right.order || left.entry.submissionId.localeCompare(right.entry.submissionId));
  return { resolved: ordered.map((item) => item.entry), unresolved: [] };
}

export function buildCompetitionStandings({
  competitionId,
  configVersion,
  config,
  submissions,
  voteTotals = [],
  ballotCount = 0,
  judgeScores = [],
  activeJudgeCount = 0,
  tieOrder = null
}) {
  if (!competitionId || !Number.isInteger(configVersion) || configVersion < 1) {
    throw new TypeError("Competition standings identity is invalid");
  }
  if (!Array.isArray(submissions) || !submissions.length) {
    throw new TypeError("At least one approved submission is required");
  }

  const votingEnabled = Boolean(config?.voting?.enabled);
  const judgingEnabled = Boolean(config?.judging?.enabled);
  if (!votingEnabled && !judgingEnabled) throw new TypeError("Competition has no scoring component");

  const voteMap = new Map(voteTotals.map((row) => [row.submissionId, Number(row.voteCount ?? 0)]));
  const judgeMap = new Map();
  for (const score of judgeScores) {
    if (!judgeMap.has(score.submissionId)) judgeMap.set(score.submissionId, []);
    judgeMap.get(score.submissionId).push(score);
  }

  const readinessErrors = [];
  if (judgingEnabled && (!Number.isInteger(activeJudgeCount) || activeJudgeCount < 1)) {
    readinessErrors.push("no_active_judges");
  }

  const computed = submissions.map((submission) => {
    const voteCount = votingEnabled ? (voteMap.get(submission.id) ?? 0) : 0;
    const communityComponent = votingEnabled
      ? communityComponentFromVotes({
          voteCount,
          ballotCount,
          mode: config.voting.communityScoreMode ?? COMMUNITY_SCORE_MODE
        })
      : null;

    const scores = judgingEnabled ? (judgeMap.get(submission.id) ?? []) : [];
    const currentScores = scores.filter((score) => Number(score.configVersion) === configVersion);
    if (judgingEnabled && currentScores.length !== activeJudgeCount) {
      readinessErrors.push(`judge_scores_incomplete:${submission.id}:${currentScores.length}/${activeJudgeCount}`);
    }
    const judgeComponent = judgingEnabled
      ? aggregateJudgeScores(currentScores.map((score) => Number(score.computedScore)))
      : null;

    const componentResult = combineCompetitionComponents({
      votingEnabled,
      judgingEnabled,
      communityComponent,
      judgeComponent: judgingEnabled && judgeComponent === null ? 0 : judgeComponent,
      communityWeight: config?.judging?.communityWeight,
      judgeWeight: config?.judging?.judgeWeight
    });

    return {
      submissionId: submission.id,
      title: submission.title,
      finalScore: componentResult.finalScore,
      communityComponent: componentResult.communityComponent,
      judgeComponent: componentResult.judgeComponent,
      voteCount,
      ballotCount,
      judgeScoreCount: currentScores.length,
      componentResult,
      judgeEvidence: currentScores.map((score) => ({
        judgeUuid: score.judgeUuid,
        computedScore: score.computedScore,
        criteria: score.criteria,
        bonusPoints: score.bonusPoints
      }))
    };
  });

  if (readinessErrors.length) {
    return { ready: false, errors: [...new Set(readinessErrors)], standings: [], unresolvedTies: [] };
  }

  computed.sort((left, right) => right.finalScore - left.finalScore || left.submissionId.localeCompare(right.submissionId));
  const finalOrder = [];
  const unresolvedTies = [];
  for (let index = 0; index < computed.length;) {
    const key = scoreGroupKey(computed[index].finalScore);
    const group = [];
    while (index < computed.length && scoreGroupKey(computed[index].finalScore) === key) {
      group.push(computed[index]);
      index += 1;
    }
    if (group.length === 1) {
      finalOrder.push(group[0]);
      continue;
    }
    const resolved = resolveTieGroup(group, config?.judging?.tiebreakRule ?? "MANUAL_STAFF", tieOrder);
    finalOrder.push(...resolved.resolved);
    if (resolved.unresolved.length) unresolvedTies.push(resolved.unresolved);
  }

  const standings = finalOrder.map((entry, index) => {
    const placement = index + 1;
    const snapshot = createResultSnapshot({
      competitionId,
      submissionId: entry.submissionId,
      configVersion,
      componentResult: entry.componentResult,
      communityEvidence: votingEnabled ? {
        scoringMode: config.voting.communityScoreMode ?? COMMUNITY_SCORE_MODE,
        rawWholeNumberPoints: entry.voteCount,
        ballotCount: entry.ballotCount
      } : null,
      judgeEvidence: judgingEnabled ? {
        activeJudgeCount,
        completedJudgeCount: entry.judgeScoreCount,
        scorecards: entry.judgeEvidence
      } : null,
      tiebreak: unresolvedTies.some((group) => group.includes(entry.submissionId))
        ? { rule: config?.judging?.tiebreakRule ?? "MANUAL_STAFF", resolved: false }
        : { rule: config?.judging?.tiebreakRule ?? "MANUAL_STAFF", resolved: true }
    });
    return {
      submissionId: entry.submissionId,
      title: entry.title,
      placement,
      finalScore: entry.finalScore,
      communityComponent: entry.communityComponent,
      judgeComponent: entry.judgeComponent,
      voteCount: entry.voteCount,
      ballotCount: entry.ballotCount,
      judgeScoreCount: entry.judgeScoreCount,
      snapshot
    };
  });

  return {
    ready: unresolvedTies.length === 0,
    errors: unresolvedTies.length ? ["tiebreak_required"] : [],
    standings,
    unresolvedTies
  };
}
