import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { activeJudgeScores } from "../functions/lib/competitions/judge-score-set.js";
import { publicJudgeFeedback } from "../functions/lib/competitions/results.js";
import { buildCompetitionStandings } from "../functions/lib/competitions/standings.js";

const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";
const SUBMISSION = "00000000-0000-4000-8000-0000000000c3";
const COMPETITION = "00000000-0000-4000-8000-0000000000d4";

function score(judgeUuid, value, publicFeedback = null) {
  return {
    submissionId: SUBMISSION,
    judgeUuid,
    configVersion: 1,
    computedScore: value,
    criteria: { quality: value },
    bonusPoints: 0,
    publicFeedback,
    privateNote: "must never become public"
  };
}

test("removed judge score rows remain auditable but are excluded from the active scoring set", () => {
  const filtered = activeJudgeScores(
    [score(A, 3), score(B, 9)],
    [{ judgeUuid: B }]
  );
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].judgeUuid, B);
  assert.equal(filtered[0].computedScore, 9);
});

test("result snapshot keeps authored public feedback but not private judge notes", () => {
  const standings = buildCompetitionStandings({
    competitionId: COMPETITION,
    configVersion: 1,
    config: {
      voting: { enabled: false },
      judging: {
        enabled: true,
        criteria: [{ id: "quality", label: "Quality", maxScore: 10, weight: 1 }],
        tiebreakRule: "MANUAL_STAFF"
      }
    },
    submissions: [{ id: SUBMISSION, title: "Castle" }],
    judgeScores: [score(B, 9, "Strong composition and detail.")],
    activeJudgeCount: 1
  });
  assert.equal(standings.ready, true);
  const serialized = JSON.stringify(standings.standings[0].snapshot);
  assert.match(serialized, /Strong composition and detail/);
  assert.equal(serialized.includes("must never become public"), false);
});

test("public feedback projection strips judge identity and scorecard internals", () => {
  const snapshot = {
    evidence: {
      judges: {
        scorecards: [{
          judgeUuid: B,
          computedScore: 9,
          criteria: { quality: 9 },
          bonusPoints: 0,
          publicFeedback: "Strong composition and detail.",
          privateNote: "secret"
        }]
      }
    }
  };
  const projected = publicJudgeFeedback(JSON.stringify(snapshot));
  assert.deepEqual(projected, ["Strong composition and detail."]);
  const serialized = JSON.stringify(projected);
  assert.equal(serialized.includes(B), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("computedScore"), false);
});

test("public feedback browser module syntax-checks and renders text safely", async () => {
  const path = new URL("../public/assets/competitions-public-feedback.js", import.meta.url);
  const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const source = await readFile(path, "utf8");
  assert.match(source, /quote\.textContent = value/);
  assert.equal(source.includes("innerHTML = value"), false);
});
