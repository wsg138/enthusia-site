import assert from "node:assert/strict";
import test from "node:test";

import {
  listCompetitionAuditEvents,
  transitionCompetitionState
} from "../functions/lib/competitions/state.js";

function fakeWritableDatabase({ changes = 1, auditRows = [] } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql, bindings: [] };
      calls.push(call);
      return {
        sql,
        bind(...bindings) {
          call.bindings = bindings;
          return this;
        },
        async all() {
          return { results: auditRows };
        }
      };
    },
    async batch(statements) {
      this.batchStatements = statements;
      return statements.map(() => ({ meta: { changes } }));
    }
  };
}

test("lifecycle transition updates state and audit in one transactional batch", async () => {
  const db = fakeWritableDatabase({ changes: 1 });
  const result = await transitionCompetitionState(db, {
    competitionId: "competition-1",
    expectedState: "DRAFT",
    targetState: "UPCOMING",
    operationId: "operation-1",
    auditEventId: "audit-1",
    actorSubject: "subject-1",
    actorUuid: "00000000-0000-0000-0000-000000000001",
    note: "Publish competition",
    createdAt: "2026-08-22T23:45:00.000Z"
  });

  assert.equal(db.batchStatements.length, 2);
  assert.match(db.calls[0].sql, /last_lifecycle_operation_id = \?/);
  assert.match(db.calls[0].sql, /published_at = CASE/);
  assert.match(db.calls[1].sql, /COMPETITION_STATE_CHANGED/);
  assert.match(db.calls[1].sql, /last_lifecycle_operation_id = \?/);
  assert.equal(result.status, "UPDATED");
  assert.equal(result.lifecycleState, "UPCOMING");
});

test("draft publication freezes reward definitions in the same transactional batch", async () => {
  const db = fakeWritableDatabase({ changes: 1 });
  const result = await transitionCompetitionState(db, {
    competitionId: "competition-1",
    expectedState: "DRAFT",
    targetState: "UPCOMING",
    operationId: "operation-1",
    auditEventId: "audit-1",
    actorSubject: "subject-1",
    actorUuid: "00000000-0000-0000-0000-000000000001",
    note: "Publish with rewards",
    createdAt: "2026-08-22T23:45:00.000Z",
    rewardDefinitions: [{
      id: "competition-1:first-money",
      placement: 1,
      rewardType: "MONEY",
      distributionMode: "SPLIT_ELIGIBLE",
      configJson: "{\"schemaVersion\":1}",
      createdAt: "2026-08-22T23:45:00.000Z"
    }]
  });

  assert.equal(db.batchStatements.length, 4);
  assert.match(db.calls[0].sql, /DELETE FROM reward_definitions/);
  assert.match(db.calls[1].sql, /INSERT INTO reward_definitions/);
  assert.match(db.calls[2].sql, /UPDATE competitions/);
  assert.match(db.calls[3].sql, /COMPETITION_STATE_CHANGED/);
  assert.equal(result.status, "UPDATED");
});

test("reward replacement is rejected outside the draft publication transition", async () => {
  const db = fakeWritableDatabase({ changes: 1 });
  await assert.rejects(() => transitionCompetitionState(db, {
    competitionId: "competition-1",
    expectedState: "UPCOMING",
    targetState: "SUBMISSIONS_OPEN",
    operationId: "operation-2",
    auditEventId: "audit-2",
    actorSubject: "subject-1",
    actorUuid: "00000000-0000-0000-0000-000000000001",
    note: "Open submissions",
    createdAt: "2026-08-22T23:46:00.000Z",
    rewardDefinitions: []
  }), /only be materialized when publishing a draft/);
});

test("stale lifecycle transition reports conflict", async () => {
  const db = fakeWritableDatabase({ changes: 0 });
  const result = await transitionCompetitionState(db, {
    competitionId: "competition-1",
    expectedState: "DRAFT",
    targetState: "UPCOMING",
    operationId: "operation-1",
    auditEventId: "audit-1",
    actorSubject: "subject-1",
    actorUuid: "00000000-0000-0000-0000-000000000001",
    note: "Publish competition",
    createdAt: "2026-08-22T23:45:00.000Z"
  });
  assert.deepEqual(result, { status: "CONFLICT" });
});

test("staff audit projection parses before and after snapshots and bounds result count", async () => {
  const db = fakeWritableDatabase({
    auditRows: [{
      id: "audit-1",
      submissionId: null,
      actorUuid: "staff-1",
      action: "COMPETITION_STATE_CHANGED",
      beforeJson: "{\"lifecycleState\":\"DRAFT\"}",
      afterJson: "{\"lifecycleState\":\"UPCOMING\"}",
      note: "Publish",
      createdAt: "2026-08-22T23:45:00.000Z"
    }]
  });

  const events = await listCompetitionAuditEvents(db, "competition-1", 5000);
  assert.equal(db.calls[0].bindings[1], 200);
  assert.equal(events[0].before.lifecycleState, "DRAFT");
  assert.equal(events[0].after.lifecycleState, "UPCOMING");
  assert.equal(events[0].beforeJson, undefined);
});
