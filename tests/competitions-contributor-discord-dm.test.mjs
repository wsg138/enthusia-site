import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  competitionContributorDiscordConfigured,
  contributorMessagePayload,
  deliverCompetitionDiscordNotification
} from "../functions/lib/competitions/discord-notifications.js";

const NOW = "2026-08-23T04:30:00.000Z";
const DISCORD = "123456789012345678";
const PLAYER = "00000000-0000-4000-8000-0000000000a1";
const OWNER = "00000000-0000-4000-8000-0000000000b2";
const COMPETITION = "00000000-0000-4000-8000-0000000000c3";
const SUBMISSION = "00000000-0000-4000-8000-0000000000d4";

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  const directory = new URL("../migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
    database.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  }
  return database;
}

function seed(database) {
  database.prepare(`
    INSERT INTO competitions (
      id, slug, title, category, lifecycle_state, current_config_version,
      created_by_subject, created_by_uuid, created_at, updated_at
    ) VALUES (?, 'summer-build', 'Summer Build', 'Build', 'SUBMISSIONS_OPEN', 1, 'staff', ?, ?, ?)
  `).run(COMPETITION, OWNER, NOW, NOW);
  database.prepare(`
    INSERT INTO competition_config_versions (
      competition_id, version, config_json, created_by_subject,
      created_by_uuid, created_at, change_note
    ) VALUES (?, 1, ?, 'staff', ?, ?, 'Initial')
  `).run(COMPETITION, JSON.stringify({ entries: { maxEntriesPerPlayer: 3 } }), OWNER, NOW);
  database.prepare(`
    INSERT INTO submissions (
      id, competition_id, entry_type, status, owner_subject, owner_uuid,
      owner_name, title, description, revision, staff_edited, created_at, updated_at
    ) VALUES (?, ?, 'GROUP', 'DRAFT', 'staff-manual:owner', ?, 'Owner', 'Castle', 'Description', 1, 0, ?, ?)
  `).run(SUBMISSION, COMPETITION, OWNER, NOW, NOW);
  database.prepare(`
    INSERT INTO competition_discord_accounts (
      discord_user_id, username, created_at, updated_at
    ) VALUES (?, 'linked-user', ?, ?)
  `).run(DISCORD, NOW, NOW);
}

function link(database) {
  database.prepare(`
    INSERT INTO competition_minecraft_links (
      minecraft_uuid, discord_user_id, minecraft_name, linked_at, updated_at
    ) VALUES (?, ?, 'Invitee', ?, ?)
  `).run(PLAYER, DISCORD, NOW, NOW);
}

function invite(database) {
  database.prepare(`
    INSERT INTO submission_participants (
      submission_id, player_uuid, player_name, participant_role,
      invite_status, invited_by_uuid, invited_at, responded_at
    ) VALUES (?, ?, 'Invitee', 'HELPER', 'PENDING', ?, ?, NULL)
  `).run(SUBMISSION, PLAYER, OWNER, NOW);
}

function inviteRows(database) {
  return database.prepare(`
    SELECT event_type AS eventType,
           recipient_discord_user_id AS recipientDiscordUserId,
           state,
           last_error AS lastError,
           payload_json AS payloadJson
    FROM competition_discord_outbox
    WHERE event_type = 'CONTRIBUTOR_INVITE'
    ORDER BY created_at, id
  `).all();
}

test("linked contributor invite queues a Discord DM with public-safe context", async () => {
  const database = await migratedDatabase();
  seed(database);
  link(database);
  invite(database);
  const rows = inviteRows(database);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].recipientDiscordUserId, DISCORD);
  assert.equal(rows[0].state, "PENDING");
  const payload = JSON.parse(rows[0].payloadJson);
  assert.equal(payload.competitionTitle, "Summer Build");
  assert.equal(payload.submissionTitle, "Castle");
  assert.equal(payload.role, "HELPER");
  assert.equal(JSON.stringify(payload).includes("coordinates"), false);
  database.close();
});

test("linking after an invitation queues any still-pending contributor DM", async () => {
  const database = await migratedDatabase();
  seed(database);
  invite(database);
  assert.equal(inviteRows(database).length, 0);
  link(database);
  assert.equal(inviteRows(database).length, 1);
  database.close();
});

test("responding before Discord delivery cancels the stale invite DM", async () => {
  const database = await migratedDatabase();
  seed(database);
  link(database);
  invite(database);
  database.prepare(`
    UPDATE submission_participants
    SET invite_status = 'ACCEPTED', responded_at = ?
    WHERE submission_id = ? AND player_uuid = ?
  `).run("2026-08-23T04:31:00.000Z", SUBMISSION, PLAYER);
  const rows = inviteRows(database);
  assert.equal(rows[0].state, "DELIVERED");
  assert.equal(rows[0].lastError, "invite_no_longer_pending");
  database.close();
});

test("contributor Discord bot configuration is optional and fail-closed", () => {
  assert.equal(competitionContributorDiscordConfigured({}), false);
  assert.equal(competitionContributorDiscordConfigured({ COMPETITIONS_DISCORD_BOT_TOKEN: "A".repeat(60) }), true);
  assert.equal(competitionContributorDiscordConfigured({ COMPETITIONS_DISCORD_BOT_TOKEN: "bad token with spaces" }), false);
});

test("contributor Discord delivery opens a DM then sends a no-mention message", async () => {
  const token = "B".repeat(60);
  const notification = {
    eventType: "CONTRIBUTOR_INVITE",
    competitionId: COMPETITION,
    submissionId: SUBMISSION,
    recipientDiscordUserId: DISCORD,
    createdAt: NOW,
    payload: {
      competitionTitle: "Summer Build",
      competitionSlug: "summer-build",
      submissionTitle: "Castle",
      playerName: "Invitee",
      role: "HELPER"
    }
  };
  const calls = [];
  const result = await deliverCompetitionDiscordNotification({
    COMPETITIONS_SITE_ORIGIN: "https://preview.enthusia.info",
    COMPETITIONS_DISCORD_BOT_TOKEN: token
  }, notification, async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/users/@me/channels")) {
      assert.equal(JSON.parse(options.body).recipient_id, DISCORD);
      return new Response(JSON.stringify({ id: "234567890123456789" }), { status: 200 });
    }
    assert.equal(url, "https://discord.com/api/v10/channels/234567890123456789/messages");
    const payload = JSON.parse(options.body);
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
    assert.match(payload.content, /Summer Build/);
    assert.match(payload.content, /summer-build/);
    return new Response(JSON.stringify({ id: "345678901234567890" }), { status: 200 });
  });
  assert.equal(result.status, "DELIVERED");
  assert.equal(result.messageId, "345678901234567890");
  assert.equal(calls.length, 2);
  assert.equal(calls.every((call) => call.options.headers.authorization === `Bot ${token}`), true);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("contributor DM payload contains no staff/private submission data", () => {
  const payload = contributorMessagePayload({
    COMPETITIONS_SITE_ORIGIN: "https://preview.enthusia.info"
  }, {
    eventType: "CONTRIBUTOR_INVITE",
    competitionId: COMPETITION,
    submissionId: SUBMISSION,
    payload: {
      competitionTitle: "Summer Build",
      competitionSlug: "summer-build",
      submissionTitle: "Castle",
      role: "MAIN"
    }
  });
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes("coordinates"), false);
  assert.equal(serialized.includes("privateNote"), false);
  assert.equal(serialized.includes("staff"), false);
});
