export const SCORING_FORMULA_VERSION = "enthusia-components-v1";

function finiteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

function boundedScore(value, label) {
  const score = finiteNumber(value, label);
  if (score < 0 || score > 10) throw new RangeError(`${label} must be between 0 and 10`);
  return score;
}

function normalizedCriteria(criteria) {
  if (!Array.isArray(criteria) || !criteria.length) {
    throw new TypeError("At least one judging criterion is required");
  }

  const seen = new Set();
  return criteria.map((criterion) => {
    const id = typeof criterion?.id === "string" ? criterion.id.trim() : "";
    const label = typeof criterion?.label === "string" ? criterion.label.trim() : "";
    const weight = finiteNumber(criterion?.weight, `Criterion ${id || "unknown"} weight`);
    if (!id || seen.has(id) || !label || criterion?.maxScore !== 10 || weight <= 0) {
      throw new TypeError("Judging criteria are invalid");
    }
    seen.add(id);
    return { id, label, maxScore: 10, weight };
  });
}

export function calculateJudgeScore({ criteria, scores, bonusPoints = 0 }) {
  const normalized = normalizedCriteria(criteria);
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) {
    throw new TypeError("Judge scores must be an object keyed by criterion ID");
  }

  let weightedTotal = 0;
  let totalWeight = 0;
  const normalizedScores = {};
  for (const criterion of normalized) {
    const score = boundedScore(scores[criterion.id], `Score for ${criterion.id}`);
    normalizedScores[criterion.id] = score;
    weightedTotal += score * criterion.weight;
    totalWeight += criterion.weight;
  }

  const bonus = finiteNumber(bonusPoints, "Judge bonus points");
  if (bonus < -10 || bonus > 10) {
    throw new RangeError("Judge bonus points must be between -10 and 10");
  }

  const baseScore = weightedTotal / totalWeight;
  const computedScore = Math.max(0, Math.min(10, baseScore + bonus));
  return {
    baseScore,
    bonusPoints: bonus,
    computedScore,
    scores: normalizedScores,
    criteria: normalized
  };
}

export function aggregateJudgeScores(judgeScores) {
  if (!Array.isArray(judgeScores) || !judgeScores.length) return null;
  const values = judgeScores.map((score, index) => boundedScore(score, `Judge score ${index + 1}`));
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function combineCompetitionComponents({
  votingEnabled,
  judgingEnabled,
  communityComponent = null,
  judgeComponent = null,
  communityWeight = null,
  judgeWeight = null
}) {
  if (!votingEnabled && !judgingEnabled) {
    throw new TypeError("At least one scoring component must be enabled");
  }

  if (votingEnabled && !judgingEnabled) {
    const community = boundedScore(communityComponent, "Community component");
    return {
      formulaVersion: SCORING_FORMULA_VERSION,
      finalScore: community,
      communityComponent: community,
      judgeComponent: null,
      communityWeight: 100,
      judgeWeight: 0
    };
  }

  if (!votingEnabled && judgingEnabled) {
    const judges = boundedScore(judgeComponent, "Judge component");
    return {
      formulaVersion: SCORING_FORMULA_VERSION,
      finalScore: judges,
      communityComponent: null,
      judgeComponent: judges,
      communityWeight: 0,
      judgeWeight: 100
    };
  }

  const community = boundedScore(communityComponent, "Community component");
  const judges = boundedScore(judgeComponent, "Judge component");
  const communityPercent = finiteNumber(communityWeight, "Community weight");
  const judgePercent = finiteNumber(judgeWeight, "Judge weight");
  if (
    communityPercent < 0
    || judgePercent < 0
    || communityPercent > 100
    || judgePercent > 100
    || Math.abs((communityPercent + judgePercent) - 100) > 1e-9
  ) {
    throw new RangeError("Community and judge weights must total 100");
  }

  return {
    formulaVersion: SCORING_FORMULA_VERSION,
    finalScore: community * communityPercent / 100 + judges * judgePercent / 100,
    communityComponent: community,
    judgeComponent: judges,
    communityWeight: communityPercent,
    judgeWeight: judgePercent
  };
}

export function createResultSnapshot({
  competitionId,
  submissionId,
  configVersion,
  componentResult,
  communityEvidence = null,
  judgeEvidence = null,
  tiebreak = null
}) {
  if (!competitionId || !submissionId || !Number.isInteger(configVersion) || configVersion < 1) {
    throw new TypeError("Result snapshot identity is invalid");
  }
  if (!componentResult || componentResult.formulaVersion !== SCORING_FORMULA_VERSION) {
    throw new TypeError("Result snapshot requires a supported component result");
  }

  return {
    schemaVersion: 1,
    formulaVersion: SCORING_FORMULA_VERSION,
    competitionId: String(competitionId),
    submissionId: String(submissionId),
    configVersion,
    components: {
      community: componentResult.communityComponent,
      judges: componentResult.judgeComponent,
      communityWeight: componentResult.communityWeight,
      judgeWeight: componentResult.judgeWeight,
      finalScore: componentResult.finalScore
    },
    evidence: {
      community: communityEvidence,
      judges: judgeEvidence
    },
    tiebreak
  };
}
