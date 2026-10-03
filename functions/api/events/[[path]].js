// functions/api/events/[[path]].js
//
// R2-backed JSON API for the Enthusia Events & Competitions page
// (public/events.html). Mirrors functions/api/leaderboards/[[path]].js.
//
// ---------------------------------------------------------------------------
// JSON CONTRACT FOR THE PUBLISHER
// ---------------------------------------------------------------------------
// All boards are stored as JSON objects in the EVENTS_DATA R2 bucket.
//
// Board names (appended to /api/events/, ".json" suffix optional):
//   events/schedule.json   - recurring schedule: hourly physical events and
//                            15-minute chat events.
//   events/stats.json      - top players by wins + recent event results.
//   (no board / empty)     -> serves events/index.json
//
// events/index.json (required, served when no board is requested):
//   { "ok": true,
//     "updatedAt": "2026-10-02T22:00:00Z",          // ISO 8601, required
//     "boards": [
//       { "id": "schedule", "path": "events/schedule.json", "label": "Schedule" },
//       { "id": "stats",    "path": "events/stats.json",    "label": "Champions" }
//     ] }                                            // "boards" required, array
//
// events/schedule.json (optional until a publisher uploads it):
//   { "ok": true,
//     "updatedAt": "2026-10-02T22:00:00Z",          // required
//     "physicalEvents": {                           // required
//       "cadence": "every hour, on the hour",       // required, display string
//       "voteStartsMinutesBefore": 15,              // required, integer
//       "choices": 5,                               // required, integer
//       "nextVoteAt": "2026-10-03T01:45:00Z",       // optional, ISO 8601
//       "nextEventAt": "2026-10-03T02:00:00Z"       // optional, ISO 8601
//     },
//     "chatEvents": {                               // required
//       "cadence": "every 15 minutes",              // required, display string
//       "minutesPastHour": [15, 30, 45],            // required, integer array
//       "nextChatEventAt": "2026-10-03T00:15:00Z",  // optional, ISO 8601
//       "types": [                                  // required, non-empty array
//         { "id": "trivia",        "name": "Trivia",        "description": "Answer first to win." },
//         { "id": "math",          "name": "Math",          "description": "Solve the equation first." },
//         { "id": "word-scramble", "name": "Word Scramble", "description": "Unscramble the word first." }
//       ]
//     } }
//
// events/stats.json (optional until a publisher uploads it):
//   { "ok": true,
//     "updatedAt": "2026-10-02T22:00:00Z",          // required
//     "topWins": [                                  // required, array (may be empty)
//       { "name": "Lincoln", "wins": 12, "eventsPlayed": 40, "losses": 28 }
//     ],                                            // name+wins required per row
//     "recentEvents": [                             // required, array (may be empty)
//       { "eventType": "Sumo", "winner": "Lincoln", "date": "2026-10-02T21:00:00Z" }
//     ] }                                            // eventType+winner+date required per row
//
// Every published JSON file must include "ok": true. All timestamps are UTC
// ISO 8601. Player names are plain display names (never raw secrets or IDs).
// The page renders only text nodes from these files, so no HTML is required.
//
// ---------------------------------------------------------------------------
// TODO: no publisher exists yet. The EnthusiaEvents plugin (or a scheduled
// worker) must periodically upload these JSON files to the EVENTS_DATA R2
// bucket. Until then, /api/events/* returns 404 "not found" and the page
// shows the static schedule plus an "event stats coming soon" placeholder.
// ---------------------------------------------------------------------------

const EVENTS_DATA_BINDING = "EVENTS_DATA";

const R2_BOARDS = {
  schedule: {
    binding: EVENTS_DATA_BINDING,
    key: "events/schedule.json",
    cacheSeconds: 60
  },
  stats: {
    binding: EVENTS_DATA_BINDING,
    key: "events/stats.json",
    cacheSeconds: 60
  },
  index: {
    binding: EVENTS_DATA_BINDING,
    key: "events/index.json",
    cacheSeconds: 60
  }
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export function getRequestedBoard(params) {
  const rawPath = params && (params.path || params["path"] || params["path*"]);
  const path = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
  let board = String(path || "");
  while (board.startsWith("/")) {
    board = board.slice(1);
  }
  while (board.endsWith("/")) {
    board = board.slice(0, -1);
  }
  if (board.toLowerCase().endsWith(".json")) {
    board = board.slice(0, -5);
  }
  return board;
}

// Pure validators for the published JSON contract. Used by tests and by the
// page (via try/catch at fetch time); they throw a descriptive Error when the
// document does not satisfy the contract documented above.

function requireFields(value, fields, where) {
  for (const field of fields) {
    if (value === null || typeof value !== "object" || !(field in value)) {
      throw new Error(`${where}: missing required field "${field}"`);
    }
  }
}

export function validateScheduleDoc(doc) {
  requireFields(doc, ["ok", "updatedAt", "physicalEvents", "chatEvents"], "schedule");
  requireFields(doc.physicalEvents, ["cadence", "voteStartsMinutesBefore", "choices"], "schedule.physicalEvents");
  requireFields(doc.chatEvents, ["cadence", "minutesPastHour", "types"], "schedule.chatEvents");
  if (!Array.isArray(doc.chatEvents.minutesPastHour)) {
    throw new Error("schedule.chatEvents.minutesPastHour must be an array");
  }
  if (!Array.isArray(doc.chatEvents.types) || doc.chatEvents.types.length === 0) {
    throw new Error("schedule.chatEvents.types must be a non-empty array");
  }
  doc.chatEvents.types.forEach((type, index) => {
    requireFields(type, ["id", "name", "description"], `schedule.chatEvents.types[${index}]`);
  });
  return true;
}

export function validateStatsDoc(doc) {
  requireFields(doc, ["ok", "updatedAt", "topWins", "recentEvents"], "stats");
  if (!Array.isArray(doc.topWins)) {
    throw new Error("stats.topWins must be an array");
  }
  doc.topWins.forEach((row, index) => {
    requireFields(row, ["name", "wins"], `stats.topWins[${index}]`);
  });
  if (!Array.isArray(doc.recentEvents)) {
    throw new Error("stats.recentEvents must be an array");
  }
  doc.recentEvents.forEach((row, index) => {
    requireFields(row, ["eventType", "winner", "date"], `stats.recentEvents[${index}]`);
  });
  return true;
}

function getR2BoardConfig(board) {
  if (board === "schedule") {
    return R2_BOARDS.schedule;
  }
  if (board === "stats") {
    return R2_BOARDS.stats;
  }
  if (board === "index") {
    return R2_BOARDS.index;
  }
  return false;
}

function getR2Bucket(env, bindingName) {
  if (bindingName === EVENTS_DATA_BINDING) {
    return env[EVENTS_DATA_BINDING];
  }
  return false;
}

async function readR2EventsBoard(env, config) {
  const bucket = getR2Bucket(env, config.binding);
  if (!bucket || typeof bucket.get !== "function") {
    return json({
      ok: false,
      error: "Events R2 binding is not configured.",
      binding: config.binding
    }, 500);
  }

  const object = await bucket.get(config.key);
  if (!object) {
    return json({
      ok: false,
      error: "Events board not found.",
      key: config.key
    }, 404);
  }

  const contentType = object.httpMetadata && object.httpMetadata.contentType
    ? object.httpMetadata.contentType
    : "application/json; charset=utf-8";

  return new Response(object.body, {
    headers: {
      "content-type": contentType,
      "cache-control": `public, max-age=${config.cacheSeconds}`,
      "access-control-allow-origin": "*"
    }
  });
}

export function onRequestGet(context) {
  const board = getRequestedBoard(context.params);
  if (!board) {
    return readR2EventsBoard(context.env, R2_BOARDS.index);
  }

  const config = getR2BoardConfig(board);
  if (!config) {
    return json({ ok: false, error: "Unknown events board." }, 404);
  }

  return readR2EventsBoard(context.env, config);
}
