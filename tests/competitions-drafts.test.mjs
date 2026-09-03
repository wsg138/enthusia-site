import assert from "node:assert/strict";
import test from "node:test";

import {
  getAdminCompetition,
  saveDraftCompetition
} from "../functions/lib/competitions/drafts.js";

function fakeDatabase({ detail = null, insertChanges = 1 } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql, bindings: [] };
      calls.push(call);
      return {
        sql,
        bindings: call.bindings,
        bind(...bindings) {
          call.bindings = bindings;
          this.bindings = bindings;
          return this;
        },
        async first() {
          return detail;
        }
      };
    },
    async batch(statements) {
      this.batchStatements = statements;
      return [
        { meta: { changes: insertChanges } },
        { meta: { changes: insertChanges } },
        { meta: { changes: insertChanges } }
      ];
    }
  };
}

test("admin detail resolves exactly the current immutable config version", async () => {
  const db = fakeDatabase({
    detail: {
      id: "competition-id",
      slug: "summer-build",
      title: "Summer Build",
      category: "Build",
      lifecycleState: "DRAFT",
      configVersion: 2,
      configJson: JSON.stringify({ schemaVersion: 1, public: { summary: "test" } })
    }
  });

  const result = await getAdminCompetition(db, "competition-id");
  assert.equal(result.configVersion, 2);
  assert.equal(result.config.public.summary, "test");
  assert.match(db.calls[0].sql, /v\.version = c\.current_config_version/);
});

test("draft save inserts a version, updates basics, and audits in one batch", async () => {
  const db = fakeDatabase({ insertChanges: 1 });
  const result = await saveDraftCompetition(db, {
    competitionId: "competition-id",
    expectedVersion: 2,
    operationId: "operation-id",
    auditEventId: "audit-id",
    title: "Updated Build",
    category: "Build",
    beforeTitle: "Summer Build",
    beforeCategory: "Build",
    config: { schemaVersion: 1, public: { summary: "updated" } },
    actorSubject: "account-subject",
    actorUuid: "00000000-0000-0000-0000-000000000001",
    createdAt: "2026-08-22T23:30:00.000Z",
    changeNote: "Updated schedule"
  });

  assert.equal(db.batchStatements.length, 3);
  assert.match(db.calls[0].sql, /INSERT INTO competition_config_versions/);
  assert.match(db.calls[0].sql, /lifecycle_state = 'DRAFT'/);
  assert.match(db.calls[1].sql, /operation_id = \?/);
  assert.match(db.calls[2].sql, /COMPETITION_DRAFT_UPDATED/);
  assert.equal(result.status, "UPDATED");
  assert.equal(result.competition.configVersion, 3);
});

test("stale or no-longer-draft save reports conflict without pretending to update", async () => {
  const db = fakeDatabase({ insertChanges: 0 });
  const result = await saveDraftCompetition(db, {
    competitionId: "competition-id",
    expectedVersion: 2,
    operationId: "operation-id",
    auditEventId: "audit-id",
    title: "Updated Build",
    category: "Build",
    beforeTitle: "Summer Build",
    beforeCategory: "Build",
    config: { schemaVersion: 1 },
    actorSubject: "account-subject",
    actorUuid: "00000000-0000-0000-0000-000000000001",
    createdAt: "2026-08-22T23:30:00.000Z",
    changeNote: "Updated schedule"
  });
  assert.deepEqual(result, { status: "CONFLICT" });
});
