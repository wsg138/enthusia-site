import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  const directory = new URL("../migrations/", import.meta.url);
  const files = (await readdir(directory)).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort();
  for (const file of files) database.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  return database;
}

function seedCompetition(database) {
  const now = "2026-08-23T04:30:00.000Z";
  database.prepare(`
    INSERT INTO competitions (
      id, slug, title, category, lifecycle_state, current_config_version,
      created_by_subject, created_by_uuid, created_at, updated_at
    ) VALUES (?, 'staff-conflict', 'Staff Conflict', 'Build', 'REVIEW', 1, ?, ?, ?, ?)
  `).run(
    "10000000-0000-4000-8000-000000000001",
    "staff:creator",
    "10000000-0000-4000-8000-000000000099",
    now,
    now
  );
  database.prepare(`
    INSERT INTO competition_discord_accounts (
      discord_user_id, username, global_name, avatar_hash, created_at, updated_at
    ) VALUES ('111111111111111111', 'owner', NULL, NULL, ?, ?)
  `).run(now, now);
  database.prepare(`
    INSERT INTO submissions (
      id, competition_id, entry_type, status, owner_subject, owner_uuid,
      owner_name, title, description, revision, created_at, updated_at
    ) VALUES (?, ?, 'GROUP', 'PENDING_REVIEW', ?, ?, 'Owner', 'Entry', 'Description', 1, ?, ?)
  `).run(
    "20000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000001",
    "discord:111111111111111111",
    "30000000-0000-4000-8000-000000000001",
    now,
    now
  );
}

function moderationInsert(database, reviewerUuid) {
  database.prepare(`
    INSERT INTO submission_moderation (
      submission_id, public_reason, private_note, reviewed_by_uuid, reviewed_at, disqualified_at
    ) VALUES (?, NULL, NULL, ?, ?, NULL)
  `).run(
    "20000000-0000-4000-8000-000000000001",
    reviewerUuid,
    "2026-08-23T04:31:00.000Z"
  );
}

test("submission owner cannot review their own entry", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  assert.throws(
    () => moderationInsert(database, "30000000-0000-4000-8000-000000000001"),
    /competition_staff_self_moderation/
  );
  database.close();
});

test("accepted participant cannot review the same entry", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  database.prepare(`
    INSERT INTO submission_participants (
      submission_id, player_uuid, player_name, participant_role,
      invite_status, invited_by_uuid, invited_at, responded_at
    ) VALUES (?, ?, 'Helper', 'HELPER', 'ACCEPTED', ?, ?, ?)
  `).run(
    "20000000-0000-4000-8000-000000000001",
    "30000000-0000-4000-8000-000000000002",
    "30000000-0000-4000-8000-000000000001",
    "2026-08-23T04:30:00.000Z",
    "2026-08-23T04:30:00.000Z"
  );
  assert.throws(
    () => moderationInsert(database, "30000000-0000-4000-8000-000000000002"),
    /competition_staff_self_moderation/
  );
  database.close();
});

test("Discord-linked alt cannot review an entry owned by another linked account", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  const now = "2026-08-23T04:30:00.000Z";
  database.prepare(`
    INSERT INTO competition_minecraft_links (
      minecraft_uuid, discord_user_id, minecraft_name, linked_at, updated_at
    ) VALUES (?, '111111111111111111', 'Owner', ?, ?)
  `).run("30000000-0000-4000-8000-000000000001", now, now);
  database.prepare(`
    INSERT INTO competition_minecraft_links (
      minecraft_uuid, discord_user_id, minecraft_name, linked_at, updated_at
    ) VALUES (?, '111111111111111111', 'StaffAlt', ?, ?)
  `).run("30000000-0000-4000-8000-000000000003", now, now);
  assert.throws(
    () => moderationInsert(database, "30000000-0000-4000-8000-000000000003"),
    /competition_staff_linked_self_moderation/
  );
  database.close();
});

test("unrelated staff member can record a moderation decision", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  moderationInsert(database, "30000000-0000-4000-8000-000000000099");
  const row = database.prepare("SELECT reviewed_by_uuid AS reviewer FROM submission_moderation").get();
  assert.equal(row.reviewer, "30000000-0000-4000-8000-000000000099");
  database.close();
});
