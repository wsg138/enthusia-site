import assert from "node:assert/strict";
import test from "node:test";

import {
  competitionSchemaReady,
  getPrivateSubmissionLocation,
  listAcceptedPublicParticipants,
  listAdminCompetitions,
  listApprovedPublicSubmissions,
  listPublicCompetitions
} from "../functions/lib/competitions/repository.js";

function fakeDatabase({ first = null, results = [] } = {}) {
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
          return typeof first === "function" ? first(call) : first;
        },
        async all() {
          return { results: typeof results === "function" ? results(call) : results };
        }
      };
    }
  };
  return db;
}

test("competition schema readiness checks the expected D1 table", async () => {
  const db = fakeDatabase({ first: { name: "competitions" } });
  assert.equal(await competitionSchemaReady(db), true);
  assert.deepEqual(db.calls[0].bindings, ["competitions"]);
});

test("public competition list is an explicit published projection", async () => {
  const db = fakeDatabase({ results: [{ id: "c1", slug: "spring-build" }] });
  const rows = await listPublicCompetitions(db);
  assert.equal(rows.length, 1);
  const sql = db.calls[0].sql;
  assert.equal(/SELECT\s+\*/i.test(sql), false);
  assert.match(sql, /published_at IS NOT NULL/i);
  assert.match(sql, /DRAFT/);
  assert.match(sql, /CANCELLED/);
});

test("public submissions never join or select the private coordinate table", async () => {
  const db = fakeDatabase();
  await listApprovedPublicSubmissions(db, "competition-1");
  const sql = db.calls[0].sql;
  assert.equal(/SELECT\s+\*/i.test(sql), false);
  assert.equal(sql.includes("submission_private_locations"), false);
  assert.equal(/\bblock_[xyz]\b/i.test(sql), false);
  assert.deepEqual(db.calls[0].bindings, ["competition-1"]);
});

test("only accepted participants are exposed by the public participant projection", async () => {
  const db = fakeDatabase();
  await listAcceptedPublicParticipants(db, "submission-1");
  assert.match(db.calls[0].sql, /invite_status = 'ACCEPTED'/);
  assert.deepEqual(db.calls[0].bindings, ["submission-1"]);
});

test("private location query is isolated to its dedicated function", async () => {
  const db = fakeDatabase({ first: { worldName: "world", x: 10, y: 64, z: 20 } });
  const location = await getPrivateSubmissionLocation(db, "submission-2");
  assert.equal(location.x, 10);
  assert.match(db.calls[0].sql, /submission_private_locations/);
  assert.deepEqual(db.calls[0].bindings, ["submission-2"]);
});

test("admin list remains explicit rather than selecting entire rows", async () => {
  const db = fakeDatabase();
  await listAdminCompetitions(db);
  assert.equal(/SELECT\s+\*/i.test(db.calls[0].sql), false);
});
