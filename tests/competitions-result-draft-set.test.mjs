import assert from "node:assert/strict";
import test from "node:test";

import {
  provisionalResultSetHash,
  replaceProvisionalResultSet
} from "../functions/lib/competitions/result-draft-set.js";

function result(submissionId, placement, finalScore) {
  return {
    submissionId,
    placement,
    finalScore,
    communityComponent: finalScore,
    judgeComponent: null,
    snapshot: {
      schemaVersion: 1,
      formulaVersion: "enthusia-components-v1",
      configVersion: 4,
      components: { finalScore }
    }
  };
}

function fakeDatabase({ existingOperation = null, updateChanges = 1 } = {}) {
  const calls = [];
  const db = {
    calls,
    prepare(sql) {
      const call = { sql, bindings: [] };
      calls.push(call);
      return {
        bind(...bindings) {
          call.bindings = bindings;
          return this;
        },
        async first() {
          if (/FROM competition_result_draft_operations/.test(sql)) return existingOperation;
          return null;
        }
      };
    },
    async batch(statements) {
      db.batchStatements = statements;
      return statements.map((statement, index) => ({
        meta: {
          changes: index === statements.length - 2 ? updateChanges : 1
        }
      }));
    }
  };
  return db;
}

test("result-set hashing is deterministic regardless of input order", async () => {
  const first = await provisionalResultSetHash([
    result("submission-b", 2, 7),
    result("submission-a", 1, 9)
  ], 4);
  const retry = await provisionalResultSetHash([
    result("submission-a", 1, 9),
    result("submission-b", 2, 7)
  ], 4);
  assert.equal(first, retry);
  assert.match(first, /^[0-9a-f]{64}$/);
});

test("result-set hashing is deterministic regardless of snapshot key order", async () => {
  const first = result("submission-a", 1, 9);
  first.snapshot.components = { community: 8, judges: { score: 10, weight: 0.6 } };
  const retry = result("submission-a", 1, 9);
  retry.snapshot.components = { judges: { weight: 0.6, score: 10 }, community: 8 };

  assert.equal(
    await provisionalResultSetHash([first], 4),
    await provisionalResultSetHash([retry], 4)
  );
});

test("result-set hashing rejects duplicate placements and duplicate submissions", async () => {
  await assert.rejects(() => provisionalResultSetHash([
    result("submission-a", 1, 9),
    result("submission-b", 1, 8)
  ], 4), /placements must be unique/);

  await assert.rejects(() => provisionalResultSetHash([
    result("submission-a", 1, 9),
    result("submission-a", 2, 8)
  ], 4), /only appear once/);
});

test("provisional replacement batches operation guard, delete, full set, marker, and audit", async () => {
  const db = fakeDatabase();
  const replaced = await replaceProvisionalResultSet(db, {
    competitionId: "competition-1",
    operationId: "operation-1",
    configVersion: 4,
    actorUuid: "staff-1",
    actorSubject: "subject-1",
    createdAt: "2026-08-23T00:50:00.000Z",
    auditEventId: "audit-1",
    note: "Recompute standings",
    results: [result("submission-a", 1, 9), result("submission-b", 2, 7)]
  });

  assert.equal(replaced.status, "UPDATED");
  assert.equal(replaced.resultCount, 2);
  assert.equal(db.batchStatements.length, 6);
  assert.match(db.calls[1].sql, /INSERT INTO competition_result_draft_operations/);
  assert.match(db.calls[2].sql, /DELETE FROM competition_result_drafts/);
  assert.match(db.calls[3].sql, /INSERT INTO competition_result_drafts/);
  assert.match(db.calls[4].sql, /INSERT INTO competition_result_drafts/);
  assert.match(db.calls[5].sql, /UPDATE competitions/);
  assert.match(db.calls[6].sql, /COMPETITION_PROVISIONAL_RESULTS_REPLACED/);
});

test("same operation and same result hash is treated as an idempotent replay", async () => {
  const results = [result("submission-a", 1, 9)];
  const hash = await provisionalResultSetHash(results, 4);
  const db = fakeDatabase({
    existingOperation: {
      operationId: "operation-1",
      competitionId: "competition-1",
      configVersion: 4,
      resultSetHash: hash,
      createdByUuid: "staff-1",
      createdAt: "2026-08-23T00:50:00.000Z"
    }
  });

  const replay = await replaceProvisionalResultSet(db, {
    competitionId: "competition-1",
    operationId: "operation-1",
    configVersion: 4,
    actorUuid: "staff-1",
    actorSubject: "subject-1",
    createdAt: "2026-08-23T00:51:00.000Z",
    auditEventId: "audit-2",
    results
  });
  assert.equal(replay.status, "REPLAY");
  assert.equal(db.batchStatements, undefined);
});

test("same operation ID cannot be reused for a different result set", async () => {
  const original = [result("submission-a", 1, 9)];
  const hash = await provisionalResultSetHash(original, 4);
  const db = fakeDatabase({
    existingOperation: {
      operationId: "operation-1",
      competitionId: "competition-1",
      configVersion: 4,
      resultSetHash: hash
    }
  });

  const conflict = await replaceProvisionalResultSet(db, {
    competitionId: "competition-1",
    operationId: "operation-1",
    configVersion: 4,
    actorUuid: "staff-1",
    actorSubject: "subject-1",
    createdAt: "2026-08-23T00:51:00.000Z",
    auditEventId: "audit-2",
    results: [result("submission-a", 1, 8)]
  });
  assert.equal(conflict.status, "OPERATION_CONFLICT");
  assert.equal(db.batchStatements, undefined);
});
