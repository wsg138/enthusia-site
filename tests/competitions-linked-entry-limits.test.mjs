import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const NOW = "2026-08-23T03:10:00.000Z";
const DISCORD = "123456789012345678";
const ALT_A = "00000000-0000-4000-8000-0000000000a1";
const ALT_B = "00000000-0000-4000-8000-0000000000b2";
const OTHER = "00000000-0000-4000-8000-0000000000c3";

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  const directory = new URL("../migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
    database.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  }
  return database;
}

function seedCompetition(database, id = "competition-limit", maxEntries = 1) {
  database.prepare(`
    INSERT INTO competitions (
      id, slug, title, category, lifecycle_state, current_config_version,
      created_by_subject, created_by_uuid, created_at, updated_at
    ) VALUES (?, ?, 'Entry Limit', 'Build', 'SUBMISSIONS_OPEN', 1, 'staff', ?, ?, ?)
  `).run(id, id, OTHER, NOW, NOW);
  database.prepare(`
    INSERT INTO competition_config_versions (
      competition_id, version, config_json, created_by_subject,
      created_by_uuid, created_at, change_note
    ) VALUES (?, 1, ?, 'staff', ?, ?, 'Initial')
  `).run(id, JSON.stringify({ entries: { maxEntriesPerPlayer: maxEntries } }), OTHER, NOW);
}

function seedDiscord(database) {
  database.prepare(`
    INSERT INTO competition_discord_accounts (
      discord_user_id, username, created_at, updated_at
    ) VALUES (?, 'linked-user', ?, ?)
  `).run(DISCORD, NOW, NOW);
}

function link(database, uuid, name) {
  database.prepare(`
    INSERT INTO competition_minecraft_links (
      minecraft_uuid, discord_user_id, minecraft_name, linked_at, updated_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run(uuid, DISCORD, name, NOW, NOW);
}

function insertSubmission(database, {
  id,
  competitionId = "competition-limit",
  ownerSubject,
  ownerUuid,
  ownerName,
  entryType = "SOLO"
}) {
  database.prepare(`
    INSERT INTO submissions (
      id, competition_id, entry_type, status, owner_subject, owner_uuid,
      owner_name, title, description, revision, staff_edited, created_at, updated_at
    ) VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, 'Entry', 'Description', 1, 0, ?, ?)
  `).run(id, competitionId, entryType, ownerSubject, ownerUuid, ownerName, NOW, NOW);
}

test("linked Minecraft alts share the entry cap even after an old participating alt is unlinked", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  seedDiscord(database);
  link(database, ALT_A, "AltA");
  link(database, ALT_B, "AltB");

  insertSubmission(database, {
    id: "entry-a",
    ownerSubject: `discord:${DISCORD}`,
    ownerUuid: ALT_A,
    ownerName: "AltA"
  });

  database.prepare("DELETE FROM competition_minecraft_links WHERE minecraft_uuid = ?").run(ALT_A);

  assert.throws(() => insertSubmission(database, {
    id: "entry-b",
    ownerSubject: `discord:${DISCORD}`,
    ownerUuid: ALT_B,
    ownerName: "AltB"
  }), /competition_linked_entry_limit_reached/);

  database.close();
});

test("accepting a MAIN invite cannot exceed the Discord identity entry cap", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  seedDiscord(database);
  link(database, ALT_A, "AltA");
  link(database, ALT_B, "AltB");

  insertSubmission(database, {
    id: "owned-entry",
    ownerSubject: `discord:${DISCORD}`,
    ownerUuid: ALT_A,
    ownerName: "AltA"
  });
  insertSubmission(database, {
    id: "group-entry",
    ownerSubject: "staff-manual:other",
    ownerUuid: OTHER,
    ownerName: "Other",
    entryType: "GROUP"
  });
  database.prepare(`
    INSERT INTO submission_participants (
      submission_id, player_uuid, player_name, participant_role,
      invite_status, invited_by_uuid, invited_at, responded_at
    ) VALUES ('group-entry', ?, 'AltB', 'MAIN', 'PENDING', ?, ?, NULL)
  `).run(ALT_B, OTHER, NOW);

  assert.throws(() => database.prepare(`
    UPDATE submission_participants
    SET invite_status = 'ACCEPTED', responded_at = ?
    WHERE submission_id = 'group-entry' AND player_uuid = ?
  `).run(NOW, ALT_B), /competition_linked_entry_limit_reached/);

  database.close();
});

test("helpers and guild workers do not consume the personal entry cap", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  seedDiscord(database);
  link(database, ALT_A, "AltA");
  link(database, ALT_B, "AltB");

  insertSubmission(database, {
    id: "owned-entry",
    ownerSubject: `discord:${DISCORD}`,
    ownerUuid: ALT_A,
    ownerName: "AltA"
  });
  insertSubmission(database, {
    id: "group-entry",
    ownerSubject: "staff-manual:other",
    ownerUuid: OTHER,
    ownerName: "Other",
    entryType: "GROUP"
  });
  database.prepare(`
    INSERT INTO submission_participants (
      submission_id, player_uuid, player_name, participant_role,
      invite_status, invited_by_uuid, invited_at, responded_at
    ) VALUES ('group-entry', ?, 'AltB', 'HELPER', 'ACCEPTED', ?, ?, ?)
  `).run(ALT_B, OTHER, NOW, NOW);

  assert.equal(database.prepare(`
    SELECT COUNT(*) AS count
    FROM submission_participants
    WHERE submission_id = 'group-entry' AND player_uuid = ? AND invite_status = 'ACCEPTED'
  `).get(ALT_B).count, 1);
  database.close();
});

test("entry-slot helper expands current UUIDs through links and identity locks", async () => {
  const source = await readFile(new URL("../functions/lib/competitions/submissions.js", import.meta.url), "utf8");
  assert.match(source, /competition_minecraft_identity_locks/);
  assert.match(source, /competition_minecraft_links/);
  assert.match(source, /countLinkedPlayerEntrySlots/);
});
