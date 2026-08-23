import test from "node:test";
import assert from "node:assert/strict";

import {
  automaticCompetitionTarget,
  SYSTEM_SUBJECT
} from "../functions/lib/competitions/scheduled-jobs.js";
import { enabled as competitionJobsEnabled } from "../cloudflare/competition-jobs/src/index.js";
import { recoverStaleCompetitionNotifications } from "../functions/lib/competitions/notifications.js";

const NOW = new Date("2026-08-23T12:00:00.000Z");

function competition(lifecycleState, overrides = {}) {
  return {
    id: "123e4567-e89b-42d3-a456-426614174000",
    lifecycleState,
    config: {
      schedule: {
        submissionsOpenAt: "2026-08-23T08:00:00.000Z",
        submissionsCloseAt: "2026-08-23T09:00:00.000Z",
        reviewCloseAt: "2026-08-23T10:00:00.000Z",
        votingOpenAt: "2026-08-23T10:00:00.000Z",
        votingCloseAt: "2026-08-23T11:00:00.000Z",
        judgingOpenAt: "2026-08-23T11:00:00.000Z",
        judgingCloseAt: "2026-08-23T11:30:00.000Z",
        ...(overrides.schedule ?? {})
      },
      voting: { enabled: true, ...(overrides.voting ?? {}) },
      judging: { enabled: true, ...(overrides.judging ?? {}) }
    }
  };
}

test("scheduled lifecycle advances ordinary date-driven stages", () => {
  assert.equal(automaticCompetitionTarget(competition("UPCOMING"), NOW), "SUBMISSIONS_OPEN");
  assert.equal(automaticCompetitionTarget(competition("SUBMISSIONS_OPEN"), NOW), "REVIEW");
  assert.equal(automaticCompetitionTarget(competition("REVIEW"), NOW), "VOTING");
  assert.equal(automaticCompetitionTarget(competition("VOTING"), NOW), "JUDGING");
  assert.equal(automaticCompetitionTarget(competition("JUDGING"), NOW), "RESULTS_READY");
});

test("scheduled lifecycle never publishes final results or drafts", () => {
  assert.equal(automaticCompetitionTarget(competition("DRAFT"), NOW), null);
  assert.equal(automaticCompetitionTarget(competition("RESULTS_READY"), NOW), null);
  assert.equal(automaticCompetitionTarget(competition("COMPLETED"), NOW), null);
});

test("review and voting skip disabled scoring stages safely", () => {
  assert.equal(
    automaticCompetitionTarget(competition("REVIEW", { voting: { enabled: false } }), NOW),
    "JUDGING"
  );
  assert.equal(
    automaticCompetitionTarget(competition("REVIEW", {
      voting: { enabled: false },
      judging: { enabled: false }
    }), NOW),
    "RESULTS_READY"
  );
  assert.equal(
    automaticCompetitionTarget(competition("VOTING", { judging: { enabled: false } }), NOW),
    "RESULTS_READY"
  );
});

test("scheduled lifecycle waits for the configured next-stage timestamp", () => {
  const early = new Date("2026-08-23T09:30:00.000Z");
  assert.equal(automaticCompetitionTarget(competition("REVIEW"), early), null);
  const afterVotingButBeforeJudging = competition("VOTING", {
    schedule: { judgingOpenAt: "2026-08-23T13:00:00.000Z" }
  });
  assert.equal(automaticCompetitionTarget(afterVotingButBeforeJudging, NOW), null);
});

test("scheduled worker is fail-closed unless explicitly enabled", () => {
  assert.equal(competitionJobsEnabled({}), false);
  assert.equal(competitionJobsEnabled({ COMPETITION_JOBS_ENABLED: "false" }), false);
  assert.equal(competitionJobsEnabled({ COMPETITION_JOBS_ENABLED: "TRUE" }), true);
  assert.equal(SYSTEM_SUBJECT, "system:competition-jobs");
});

test("stale notification recovery uses a bounded delivery lease", async () => {
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          calls.push({ sql, values });
          return {
            async run() {
              return { meta: { changes: 2 } };
            }
          };
        }
      };
    }
  };

  const recovered = await recoverStaleCompetitionNotifications(
    db,
    "2026-08-23T12:00:00.000Z",
    300
  );
  assert.equal(recovered, 2);
  assert.match(calls[0].sql, /state = 'DELIVERING'/);
  assert.equal(calls[0].values[0], "2026-08-23T12:00:00.000Z");
  assert.equal(calls[0].values[2], "2026-08-23T11:55:00.000Z");
});
