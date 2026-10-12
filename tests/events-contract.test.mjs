// Contract tests for the events API (functions/api/events/[[path]].js).
//
// 1. Board-name parsing via the exported getRequestedBoard helper.
// 2. onRequestGet routing: index default, known boards, unknown board 404,
//    missing R2 binding 500, missing R2 object 404, success passthrough.
// 3. Sample schedule.json / stats.json fixtures validated against the
//    documented JSON contract via the exported validators.

import assert from "node:assert/strict";
import test from "node:test";
import {
  getRequestedBoard,
  onRequestGet,
  validateScheduleDoc,
  validateStatsDoc
} from "../functions/api/events/[[path]].js";

// --- Fixtures ---------------------------------------------------------------

const sampleSchedule = {
  ok: true,
  updatedAt: "2026-10-02T22:00:00Z",
  physicalEvents: {
    cadence: "every hour, on the hour",
    voteStartsMinutesBefore: 15,
    choices: 5,
    nextVoteAt: "2026-10-03T01:45:00Z",
    nextEventAt: "2026-10-03T02:00:00Z"
  },
  chatEvents: {
    cadence: "every 15 minutes",
    minutesPastHour: [15, 30, 45],
    nextChatEventAt: "2026-10-03T00:15:00Z",
    types: [
      { id: "trivia", name: "Trivia", description: "Answer first to win." },
      { id: "math", name: "Math", description: "Solve the equation first." },
      { id: "word-scramble", name: "Word Scramble", description: "Unscramble the word first." }
    ]
  }
};

const sampleStats = {
  ok: true,
  updatedAt: "2026-10-02T22:00:00Z",
  topWins: [
    { name: "Lincoln", wins: 12, eventsPlayed: 40, losses: 28 },
    { name: "Badger", wins: 7, eventsPlayed: 22, losses: 15 }
  ],
  recentEvents: [
    { eventType: "Sumo", winner: "Lincoln", date: "2026-10-02T21:00:00Z" },
    { eventType: "Trivia", winner: "Badger", date: "2026-10-02T20:30:00Z" }
  ]
};

// --- Board-name parsing ------------------------------------------------------

test("getRequestedBoard: empty path resolves to the index board", () => {
  assert.equal(getRequestedBoard({}), "");
  assert.equal(getRequestedBoard({ path: [] }), "");
  assert.equal(getRequestedBoard({ path: [""] }), "");
  assert.equal(getRequestedBoard(null), "");
});

test("getRequestedBoard: strips the .json suffix", () => {
  assert.equal(getRequestedBoard({ path: ["schedule.json"] }), "schedule");
  assert.equal(getRequestedBoard({ path: ["stats.json"] }), "stats");
  assert.equal(getRequestedBoard({ path: ["index.json"] }), "index");
});

test("getRequestedBoard: strips leading/trailing slashes and is case-insensitive on the suffix", () => {
  assert.equal(getRequestedBoard({ path: ["/stats.json/"] }), "stats");
  // mirrored behavior: the ".json" suffix strip is case-insensitive, the board
  // name itself keeps its case (unknown boards then 404 by exact match)
  assert.equal(getRequestedBoard({ path: ["SCHEDULE.JSON"] }), "SCHEDULE");
});

test("getRequestedBoard: joins nested path segments", () => {
  assert.equal(getRequestedBoard({ path: ["events", "schedule.json"] }), "events/schedule");
});

test("getRequestedBoard: unknown boards pass through so the router can 404 them", () => {
  assert.equal(getRequestedBoard({ path: ["bogus"] }), "bogus");
  assert.equal(getRequestedBoard({ path: ["bogus.json"] }), "bogus");
});

// --- Routing -----------------------------------------------------------------

async function readJson(maybeResponse) {
  const response = await maybeResponse;
  return { status: response.status, body: await response.json() };
}

test("onRequestGet: unknown board returns 404 JSON error", async () => {
  const { status, body } = await readJson(
    onRequestGet({ params: { path: ["bogus"] }, env: {} })
  );
  assert.equal(status, 404);
  assert.equal(body.ok, false);
  assert.equal(body.error, "Unknown events board.");
});

test("onRequestGet: missing R2 binding returns 500 JSON error", async () => {
  const { status, body } = await readJson(
    onRequestGet({ params: { path: ["schedule"] }, env: {} })
  );
  assert.equal(status, 500);
  assert.equal(body.ok, false);
  assert.equal(body.binding, "EVENTS_DATA");
});

test("onRequestGet: missing R2 object returns 404 JSON error", async () => {
  const env = { EVENTS_DATA: { get: async () => null } };
  const { status, body } = await readJson(
    onRequestGet({ params: { path: ["stats"] }, env })
  );
  assert.equal(status, 404);
  assert.equal(body.ok, false);
  assert.equal(body.key, "events/stats.json");
});

test("onRequestGet: empty board serves the index board", async () => {
  const env = { EVENTS_DATA: { get: async () => null } };
  const { status, body } = await readJson(
    onRequestGet({ params: { path: [] }, env })
  );
  assert.equal(status, 404);
  assert.equal(body.key, "events/index.json");
});

test("onRequestGet: streams the R2 object body with public caching", async () => {
  const payload = JSON.stringify(sampleSchedule);
  const env = {
    EVENTS_DATA: {
      get: async () => ({ body: payload, httpMetadata: { contentType: "application/json" } })
    }
  };
  const response = await onRequestGet({ params: { path: ["schedule.json"] }, env });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=60");
  assert.deepEqual(await response.json(), sampleSchedule);
});

// --- Contract validation -----------------------------------------------------

test("validateScheduleDoc: accepts the documented schedule contract", () => {
  assert.equal(validateScheduleDoc(sampleSchedule), true);
});

test("validateScheduleDoc: rejects missing required fields", () => {
  const missing = structuredClone(sampleSchedule);
  delete missing.chatEvents.types;
  assert.throws(() => validateScheduleDoc(missing), /chatEvents.*types/);
  const emptyTypes = structuredClone(sampleSchedule);
  emptyTypes.chatEvents.types = [];
  assert.throws(() => validateScheduleDoc(emptyTypes), /non-empty array/);
  const badType = structuredClone(sampleSchedule);
  delete badType.chatEvents.types[0].id;
  assert.throws(() => validateScheduleDoc(badType), /types\[0\].*"id"/);
});

test("validateStatsDoc: accepts the documented stats contract", () => {
  assert.equal(validateStatsDoc(sampleStats), true);
});

test("validateStatsDoc: accepts empty boards", () => {
  assert.equal(
    validateStatsDoc({ ok: true, updatedAt: "2026-10-02T22:00:00Z", topWins: [], recentEvents: [] }),
    true
  );
});

test("validateStatsDoc: rejects malformed rows", () => {
  const noWins = structuredClone(sampleStats);
  delete noWins.topWins[0].wins;
  assert.throws(() => validateStatsDoc(noWins), /topWins\[0\].*"wins"/);
  const noDate = structuredClone(sampleStats);
  delete noDate.recentEvents[1].date;
  assert.throws(() => validateStatsDoc(noDate), /recentEvents\[1\].*"date"/);
});
