import assert from "node:assert/strict";
import test from "node:test";

import {
  isActiveCompetitionJudge,
  listCompetitionJudgeScores,
  saveJudgeScore
} from "../functions/lib/competitions/judges.js";

function fakeDatabase({ first = null, rows = [], runChanges = 1 } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql, bindings: [] };
      calls.push(call);
      return {
        bind(...bindings) {
          call.bindings = bindings;
          return this;
        },
        async first() { return first; },
        async all() { return { results: rows }; },
        async run() { return { meta: { changes: runChanges } }; }
      };
    }
  };
}

test("active judge lookup requires a nonremoved assignment", async () => {
  const db = fakeDatabase({ first: { assigned: 1 } });
  assert.equal(await isActiveCompetitionJudge(db, "competition-1", "judge-1"), true);
  assert.match(db.calls[0].sql, /removed_at IS NULL/);
  assert.deepEqual(db.calls[0].bindings, ["competition-1", "judge-1"]);
});

test("judge score calculation is validated and stored from configured criteria", async () => {
  const db = fakeDatabase({ runChanges: 1 });
  const saved = await saveJudgeScore(db, {
    competitionId: "competition-1",
    submissionId: "submission-1",
    judgeUuid: "judge-1",
    configVersion: 3,
    criteria: [
      { id: "creativity", label: "Creativity", maxScore: 10, weight: 2 },
      { id: "execution", label: "Execution", maxScore: 10, weight: 1 }
    ],
    scores: { creativity: 9, execution: 6 },
    bonusPoints: 0.5,
    publicFeedback: "Strong concept.",
    privateNote: "No private issue.",
    submittedAt: "2026-08-23T01:00:00.000Z",
    updatedAt: "2026-08-23T01:00:00.000Z"
  });

  assert.equal(saved.updated, true);
  assert.equal(saved.computedScore, 8.5);
  assert.match(db.calls[0].sql, /ON CONFLICT\(competition_id, submission_id, judge_uuid\)/);
  assert.equal(db.calls[0].bindings.includes(JSON.stringify({ creativity: 9, execution: 6 })), true);
});

test("judge score list parses criteria while preserving private notes for staff only", async () => {
  const db = fakeDatabase({
    rows: [{
      submissionId: "submission-1",
      judgeUuid: "judge-1",
      judgeName: "Judge",
      configVersion: 1,
      criteriaJson: "{\"quality\":9}",
      bonusPoints: 0,
      computedScore: 9,
      publicFeedback: "Nice build",
      privateNote: "Staff-only note",
      submittedAt: "now",
      updatedAt: "now"
    }]
  });
  const scores = await listCompetitionJudgeScores(db, "competition-1");
  assert.deepEqual(scores[0].criteria, { quality: 9 });
  assert.equal(scores[0].privateNote, "Staff-only note");
  assert.equal(scores[0].criteriaJson, undefined);
});
