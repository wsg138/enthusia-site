import assert from "node:assert/strict";
import test from "node:test";

import {
  SCORING_FORMULA_VERSION,
  aggregateJudgeScores,
  calculateJudgeScore,
  combineCompetitionComponents,
  createResultSnapshot
} from "../functions/lib/competitions/scoring.js";

const criteria = [
  { id: "creativity", label: "Creativity", maxScore: 10, weight: 2 },
  { id: "execution", label: "Execution", maxScore: 10, weight: 1 }
];

test("judge category scoring uses configured criterion weights on a 0-10 scale", () => {
  const result = calculateJudgeScore({
    criteria,
    scores: { creativity: 9, execution: 6 },
    bonusPoints: 0.5
  });
  assert.equal(result.baseScore, 8);
  assert.equal(result.computedScore, 8.5);
  assert.deepEqual(result.scores, { creativity: 9, execution: 6 });
});

test("judge bonus cannot escape the public 0-10 component scale", () => {
  assert.equal(calculateJudgeScore({
    criteria,
    scores: { creativity: 10, execution: 10 },
    bonusPoints: 2
  }).computedScore, 10);

  assert.equal(calculateJudgeScore({
    criteria,
    scores: { creativity: 0, execution: 0 },
    bonusPoints: -2
  }).computedScore, 0);
});

test("aggregate judge component averages completed judge scores", () => {
  assert.equal(aggregateJudgeScores([8, 10, 6]), 8);
  assert.equal(aggregateJudgeScores([]), null);
});

test("single-component competitions use that component as the final score", () => {
  assert.deepEqual(combineCompetitionComponents({
    votingEnabled: true,
    judgingEnabled: false,
    communityComponent: 7.25
  }), {
    formulaVersion: SCORING_FORMULA_VERSION,
    finalScore: 7.25,
    communityComponent: 7.25,
    judgeComponent: null,
    communityWeight: 100,
    judgeWeight: 0
  });
});

test("combined scoring applies the configured community and judge percentages", () => {
  const result = combineCompetitionComponents({
    votingEnabled: true,
    judgingEnabled: true,
    communityComponent: 8,
    judgeComponent: 9,
    communityWeight: 40,
    judgeWeight: 60
  });
  assert.equal(result.finalScore, 8.6);
  assert.equal(result.formulaVersion, SCORING_FORMULA_VERSION);
});

test("combined scoring refuses incomplete or inconsistent component weights", () => {
  assert.throws(() => combineCompetitionComponents({
    votingEnabled: true,
    judgingEnabled: true,
    communityComponent: 8,
    judgeComponent: 9,
    communityWeight: 40,
    judgeWeight: 50
  }), /total 100/);

  assert.throws(() => combineCompetitionComponents({
    votingEnabled: false,
    judgingEnabled: false
  }), /At least one scoring component/);
});

test("result snapshots preserve formula version, config version, evidence, and tiebreak", () => {
  const componentResult = combineCompetitionComponents({
    votingEnabled: true,
    judgingEnabled: true,
    communityComponent: 8,
    judgeComponent: 9,
    communityWeight: 40,
    judgeWeight: 60
  });
  const snapshot = createResultSnapshot({
    competitionId: "competition-1",
    submissionId: "submission-1",
    configVersion: 7,
    componentResult,
    communityEvidence: { normalizedComponent: 8, rawVotes: 12, normalization: "pending-configured-method" },
    judgeEvidence: { completedJudges: 3 },
    tiebreak: { rule: "HIGHEST_JUDGE_SCORE", applied: false }
  });

  assert.equal(snapshot.formulaVersion, SCORING_FORMULA_VERSION);
  assert.equal(snapshot.configVersion, 7);
  assert.equal(snapshot.components.finalScore, 8.6);
  assert.equal(snapshot.evidence.community.rawVotes, 12);
  assert.equal(snapshot.tiebreak.rule, "HIGHEST_JUDGE_SCORE");
});
