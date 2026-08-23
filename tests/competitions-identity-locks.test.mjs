import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const PLAYER = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const STAFF = "00000000-0000-4000-8000-0000000000c3";
const DISCORD_A = "100000000000000001";
const DISCORD_B = "100000000000000002";
const NOW = "2026-08-23T03:00:00.000Z";

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  const directory = new URL("../migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
    database.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  }
  return database;
}

function account(database, id) {
  database.prepare(`
    INSERT INTO competition_discord_accounts (
      discord_user_id, username, created_at, updated_at
    ) VALUES (?, ?, ?, ?)
  `).run(id, `user-${id}`, NOW, NOW);
}

function link(database, uuid, discordId, name = "Player") {
  database.prepare(`
    INSERT INTO competition_minecraft_links (
      minecraft_uuid, discord_user_id, minecraft_name, linked_at, updated_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run(uuid, discordId, name, NOW, NOW);
}

function competition(database) {
  database.prepare(`
    INSERT INTO competitions (
      id, slug, title, category, lifecycle_state, current_config_version,
      created_by_subject, created_by_uuid, created_at, updated_at
    ) VALUES ('competition-1', 'identity-lock', 'Identity Lock', 'Build', 'VOTING', 1, 'staff', ?, ?, ?)
  `).run(STAFF, NOW, NOW);
  database.prepare(`
    INSERT INTO competition_config_versions (
      competition_id, version, config_json, created_by_subject,
      created_by_uuid, created_at, change_note
    ) VALUES ('competition-1', 1, ?, 'staff', ?, ?, 'Initial')
  `).run(JSON.stringify({ voting: { votesPerVoter: 3 } }), STAFF, NOW);
  database.prepare(`
    INSERT INTO submissions (
      id, competition_id, entry_type, status, owner_subject, owner_uuid,
      owner_name, title, description, revision, created_at, updated_at, approved_at
    ) VALUES ('entry-1', 'competition-1', 'SOLO', 'APPROVED', 'owner', ?, 'Other', 'Entry', 'Description', 1, ?, ?, ?)
  `).run(OTHER, NOW, NOW, NOW);
}

test("a Minecraft UUID is permanently tied to the Discord identity that first votes with it", async () => {
  const database = await migratedDatabase();
  account(database, DISCORD_A);
  account(database, DISCORD_B);
  link(database, PLAYER, DISCORD_A);
  competition(database);

  database.prepare(`
    INSERT INTO votes (
      competition_id, voter_subject, voter_uuid, submission_id, created_at, updated_at
    ) VALUES ('competition-1', ?, ?, 'entry-1', ?, ?)
  `).run(`discord:${DISCORD_A}`, PLAYER, NOW, NOW);

  const lock = database.prepare(`
    SELECT discord_user_id AS discordUserId, reason
    FROM competition_minecraft_identity_locks
    WHERE minecraft_uuid = ?
  `).get(PLAYER);
  assert.equal(lock.discordUserId, DISCORD_A);
  assert.equal(lock.reason, "VOTE");

  database.prepare("DELETE FROM competition_minecraft_links WHERE minecraft_uuid = ?").run(PLAYER);
  assert.throws(
    () => link(database, PLAYER, DISCORD_B),
    /minecraft_identity_locked_to_another_discord/
  );
  link(database, PLAYER, DISCORD_A);
  database.close();
});

test("unused Minecraft links may move before they acquire competition history", async () => {
  const database = await migratedDatabase();
  account(database, DISCORD_A);
  account(database, DISCORD_B);
  link(database, PLAYER, DISCORD_A);
  database.prepare("DELETE FROM competition_minecraft_links WHERE minecraft_uuid = ?").run(PLAYER);
  link(database, PLAYER, DISCORD_B);
  assert.equal(
    database.prepare("SELECT discord_user_id AS discordUserId FROM competition_minecraft_links WHERE minecraft_uuid = ?").get(PLAYER).discordUserId,
    DISCORD_B
  );
  database.close();
});
