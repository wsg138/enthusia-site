import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  appealDiscordConfigured,
  appealUpdateMessage,
  deliverAppealDiscordNotification,
  drainAppealDiscordNotifications,
  recoverStaleAppealDiscordNotifications
} from "../functions/lib/appeal-notifications.js";

const NOW = "2026-08-25T12:00:00.000Z";
const OWNER_ID = "1".repeat(18);
const CHANNEL_ID = "2".repeat(18);
const MESSAGE_ID = "3".repeat(18);
const APPEAL_ID = "55555555-5555-4555-8555-555555555555";
const PLAYER_ID = "22222222-2222-4222-8222-222222222222";
const PUNISHMENT_ID = "33333333-3333-4333-8333-333333333333";
const STAFF_COMMENT_ID = "66666666-6666-4666-8666-666666666666";

function d1(database) {
  return {
    prepare(sql) {
      let values = [];
      return {
        bind(...parameters) { values = parameters; return this; },
        async all() { return { results: database.prepare(sql).all(...values) }; },
        async run() {
          const result = database.prepare(sql).run(...values);
          return { meta: { changes: Number(result.changes ?? 0) } };
        }
      };
    }
  };
}

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  const directory = new URL("../migrations/", import.meta.url);
  const files = (await readdir(directory)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  for (const file of files) {
    database.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  }
  database.prepare(`
    INSERT INTO competition_discord_accounts (
      discord_user_id, username, global_name, avatar_hash,
      created_at, updated_at, guild_role_ids_json
    ) VALUES (?, 'P2wn', 'P2wn', NULL, ?, ?, '[]')
  `).run(OWNER_ID, NOW, NOW);
  database.prepare(`
    INSERT INTO appeal_submissions (
      draft_id, appeal_id, owner_discord_id, minecraft_uuid, minecraft_name,
      punishment_id, answers_json, attachment_ids_json, staff_reason,
      payload_hash, status, created_at, updated_at, expires_at, submitted_at,
      case_id, punishment_type, current_status, current_version, status_updated_at
    ) VALUES (?, ?, ?, ?, 'P2wn', ?, '{}', '[]', ?, ?, 'SUBMITTED', ?, ?, ?, ?,
              'E-1042', 'MUTE', 'OPEN', 1, ?)
  `).run(
    "11111111-1111-4111-8111-111111111111",
    APPEAL_ID,
    OWNER_ID,
    PLAYER_ID,
    PUNISHMENT_ID,
    "A sufficiently detailed appeal reason.",
    "a".repeat(64),
    NOW,
    NOW,
    "2026-08-27T12:00:00.000Z",
    NOW,
    NOW
  );
  return database;
}

function addComment(database, {
  id = STAFF_COMMENT_ID,
  authorType = "STAFF",
  authorId = "77777777-7777-4777-8777-777777777777",
  authorName = "Moderator",
  body = "Please add the missing context.",
  idempotencyKey = "staff-comment-1"
} = {}) {
  database.prepare(`
    INSERT INTO appeal_comments (
      id, appeal_id, author_type, author_id, author_name,
      body, idempotency_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, APPEAL_ID, authorType, authorId, authorName, body, idempotencyKey, NOW);
}

function notificationRows(database) {
  return database.prepare(`
    SELECT id, appeal_id AS appealId, owner_discord_id AS ownerDiscordId,
           event_type AS eventType, operation_key AS operationKey,
           payload_json AS payloadJson, state, attempts,
           next_attempt_at AS nextAttemptAt, updated_at AS updatedAt,
           last_error AS lastError
    FROM appeal_discord_outbox
    ORDER BY created_at, id
  `).all();
}

function notification() {
  return {
    id: "88888888-8888-4888-8888-888888888888",
    eventType: "APPEAL_UPDATE",
    recipientDiscordUserId: OWNER_ID,
    createdAt: NOW,
    payload: { appealId: APPEAL_ID }
  };
}

test("staff appeal updates queue one private-safe Discord notification", async () => {
  const database = await migratedDatabase();
  addComment(database);
  addComment(database, {
    id: "99999999-9999-4999-8999-999999999999",
    authorType: "PLAYER",
    authorId: OWNER_ID,
    authorName: "P2wn",
    body: "Here is the requested context.",
    idempotencyKey: "player-comment-1"
  });

  const rows = notificationRows(database);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ownerDiscordId, OWNER_ID);
  assert.equal(rows[0].eventType, "APPEAL_UPDATE");
  assert.equal(rows[0].state, "PENDING");
  assert.deepEqual(JSON.parse(rows[0].payloadJson), { appealId: APPEAL_ID });
  const serialized = JSON.stringify(rows[0]);
  assert.doesNotMatch(serialized, /missing context|Moderator|MUTE|E-1042|punishment/i);
  database.close();
});

test("appeal notification message links to the private history without copying moderation data", () => {
  const message = appealUpdateMessage(
    { COMPETITIONS_SITE_ORIGIN: "https://preview.enthusia.info" },
    notification()
  );
  assert.match(message.content, /update on your Enthusia appeal/);
  assert.match(message.content, new RegExp(`/appeal\\.html\\?appeal=${APPEAL_ID}#history`));
  assert.deepEqual(message.allowed_mentions, { parse: [] });
  assert.doesNotMatch(message.content, /approved|denied|mute|reason|evidence/i);
});

test("appeal Discord delivery opens a DM and sends a no-mention notice", async () => {
  const token = "B".repeat(60);
  const calls = [];
  const result = await deliverAppealDiscordNotification({
    COMPETITIONS_SITE_ORIGIN: "https://preview.enthusia.info",
    ENTHUSIA_SITE_DISCORD_BOT_TOKEN: token
  }, notification(), async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/users/@me/channels")) {
      assert.equal(JSON.parse(options.body).recipient_id, OWNER_ID);
      return new Response(JSON.stringify({ id: CHANNEL_ID }), { status: 200 });
    }
    assert.equal(url, `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`);
    const payload = JSON.parse(options.body);
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
    assert.match(payload.content, /appeal/);
    return new Response(JSON.stringify({ id: MESSAGE_ID }), { status: 200 });
  });
  assert.deepEqual(result, { status: "DELIVERED", messageId: MESSAGE_ID });
  assert.equal(calls.length, 2);
  assert.equal(calls.every((call) => call.options.headers.authorization === `Bot ${token}`), true);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("appeal Discord drain delivers the durable row exactly once", async () => {
  const database = await migratedDatabase();
  addComment(database);
  const db = d1(database);
  const outcomes = await drainAppealDiscordNotifications({
    COMPETITIONS_SITE_ORIGIN: "https://preview.enthusia.info",
    ENTHUSIA_SITE_DISCORD_BOT_TOKEN: "C".repeat(60)
  }, db, {
    fetchImpl: async (url) => url.endsWith("/users/@me/channels")
      ? new Response(JSON.stringify({ id: CHANNEL_ID }), { status: 200 })
      : new Response(JSON.stringify({ id: MESSAGE_ID }), { status: 200 })
  });
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].status, "DELIVERED");
  const row = notificationRows(database)[0];
  assert.equal(row.state, "DELIVERED");
  assert.equal(row.attempts, 1);
  assert.deepEqual(await drainAppealDiscordNotifications({
    COMPETITIONS_SITE_ORIGIN: "https://preview.enthusia.info",
    ENTHUSIA_SITE_DISCORD_BOT_TOKEN: "C".repeat(60)
  }, db), []);
  database.close();
});

test("failed appeal DMs remain retryable and stale claims are recovered", async () => {
  const database = await migratedDatabase();
  addComment(database);
  const db = d1(database);
  const outcomes = await drainAppealDiscordNotifications({
    COMPETITIONS_SITE_ORIGIN: "https://preview.enthusia.info",
    ENTHUSIA_SITE_DISCORD_BOT_TOKEN: "D".repeat(60)
  }, db, {
    fetchImpl: async () => new Response(JSON.stringify({ message: "blocked" }), { status: 403 })
  });
  assert.equal(outcomes[0].status, "FAILED");
  let row = notificationRows(database)[0];
  assert.equal(row.state, "FAILED");
  assert.match(row.lastError, /403:blocked/);

  database.prepare(`
    UPDATE appeal_discord_outbox
    SET state = 'DELIVERING', updated_at = '2026-08-25T11:00:00.000Z'
  `).run();
  assert.equal(await recoverStaleAppealDiscordNotifications(db, NOW, 300), 1);
  row = notificationRows(database)[0];
  assert.equal(row.state, "FAILED");
  assert.equal(row.nextAttemptAt, NOW);
  database.close();
});

test("players who cannot receive bot DMs do not create an endless retry", async () => {
  const database = await migratedDatabase();
  addComment(database);
  const outcomes = await drainAppealDiscordNotifications({
    COMPETITIONS_SITE_ORIGIN: "https://preview.enthusia.info",
    ENTHUSIA_SITE_DISCORD_BOT_TOKEN: "E".repeat(60)
  }, d1(database), {
    fetchImpl: async () => new Response(
      JSON.stringify({ code: 50007, message: "Cannot send messages to this user" }),
      { status: 403 }
    )
  });
  assert.equal(outcomes[0].status, "UNREACHABLE");
  const row = notificationRows(database)[0];
  assert.equal(row.state, "ABANDONED");
  assert.equal(row.lastError, "recipient_unreachable");
  database.close();
});

test("appeal Discord delivery is optional and accepts the migration token name", () => {
  assert.equal(appealDiscordConfigured({}), false);
  assert.equal(appealDiscordConfigured({ ENTHUSIA_SITE_DISCORD_BOT_TOKEN: "F".repeat(60) }), true);
  assert.equal(appealDiscordConfigured({ COMPETITIONS_DISCORD_BOT_TOKEN: "G".repeat(60) }), true);
  assert.equal(appealDiscordConfigured({ ENTHUSIA_SITE_DISCORD_BOT_TOKEN: "bad token" }), false);
});
