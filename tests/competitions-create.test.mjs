import assert from "node:assert/strict";
import test from "node:test";

import { createDraftCompetition } from "../functions/lib/competitions/repository.js";

function writableDatabase() {
  const prepared = [];
  const db = {
    prepared,
    batches: [],
    prepare(sql) {
      const statement = {
        sql,
        bindings: [],
        bind(...bindings) {
          this.bindings = bindings;
          return this;
        }
      };
      prepared.push(statement);
      return statement;
    },
    async batch(statements) {
      this.batches.push(statements);
      return statements.map(() => ({ success: true }));
    }
  };
  return db;
}

test("draft competition creation writes competition, config version, and audit atomically", async () => {
  const db = writableDatabase();
  const draft = {
    id: "competition-id",
    auditEventId: "audit-id",
    slug: "summer-build",
    title: "Summer Build",
    category: "Build",
    createdBySubject: "discord-subject",
    createdByUuid: "00000000-0000-0000-0000-000000000001",
    createdAt: "2026-08-22T23:00:00.000Z",
    config: { schemaVersion: 1, voting: { enabled: false } }
  };

  const created = await createDraftCompetition(db, draft);
  assert.equal(db.batches.length, 1);
  assert.equal(db.batches[0].length, 3);
  assert.match(db.batches[0][0].sql, /INSERT INTO competitions/);
  assert.match(db.batches[0][1].sql, /INSERT INTO competition_config_versions/);
  assert.match(db.batches[0][2].sql, /INSERT INTO competition_audit_events/);
  assert.equal(db.batches[0][0].bindings[0], "competition-id");
  assert.equal(db.batches[0][0].bindings[4], "discord-subject");
  assert.match(db.batches[0][1].bindings[1], /"schemaVersion":1/);
  assert.equal(created.lifecycleState, "DRAFT");
  assert.equal(created.configVersion, 1);
});
