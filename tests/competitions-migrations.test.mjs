import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

async function migrationFiles() {
  const directory = new URL("../migrations/", import.meta.url);
  return (await readdir(directory))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
}

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  for (const file of await migrationFiles()) {
    const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8");
    database.exec(sql);
  }
  return database;
}

function seedDraft(database) {
  database.prepare(`
    INSERT INTO competitions (
      id, slug, title, category, lifecycle_state, current_config_version,
      created_by_subject, created_by_uuid, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'DRAFT', 1, ?, ?, ?, ?)
  `).run(
    "competition-1",
    "summer-build",
    "Summer Build",
    "Build",
    "subject-1",
    "00000000-0000-0000-0000-000000000001",
    "2026-08-22T23:00:00.000Z",
    "2026-08-22T23:00:00.000Z"
  );
  database.prepare(`
    INSERT INTO competition_config_versions (
      competition_id, version, config_json, created_by_subject,
      created_by_uuid, created_at, change_note
    ) VALUES (?, 1, ?, ?, ?, ?, ?)
  `).run(
    "competition-1",
    "{}",
    "subject-1",
    "00000000-0000-0000-0000-000000000001",
    "2026-08-22T23:00:00.000Z",
    "Initial draft"
  );
}

test("every numbered competition migration applies cleanly to SQLite", async () => {
  const files = await migrationFiles();
  assert.ok(files.includes("0005_competition_lifecycle_operations.sql"));
  assert.ok(files.includes("0006_competition_media.sql"));

  const database = await migratedDatabase();
  const tables = database.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'competition%'
  `).all();
  assert.ok(tables.some((row) => row.name === "competitions"));
  assert.ok(tables.some((row) => row.name === "competition_config_versions"));
  assert.ok(tables.some((row) => row.name === "competition_audit_events"));
  assert.ok(tables.some((row) => row.name === "competition_media"));

  const appealTables = database.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'appeal_%'
  `).all();
  assert.ok(appealTables.some((row) => row.name === "appeal_submissions"));
  assert.ok(appealTables.some((row) => row.name === "appeal_attachments"));

  const competitionColumns = database.prepare("PRAGMA table_info(competitions)").all();
  assert.ok(competitionColumns.some((column) => column.name === "last_lifecycle_operation_id"));
  database.close();
});

test("competition visibility defaults to public and rejects unknown modes", async () => {
  const database = await migratedDatabase();
  seedDraft(database);
  const row = database.prepare("SELECT visibility FROM competitions WHERE id = ?").get("competition-1");
  assert.equal(row.visibility, "PUBLIC");
  assert.throws(
    () => database.prepare("UPDATE competitions SET visibility = 'SECRET' WHERE id = ?").run("competition-1"),
    /CHECK constraint failed/
  );
  database.close();
});

test("config-version trigger atomically advances only sequential versions", async () => {
  const database = await migratedDatabase();
  seedDraft(database);

  database.prepare(`
    INSERT INTO competition_config_versions (
      competition_id, version, config_json, created_by_subject,
      created_by_uuid, created_at, change_note, operation_id
    ) VALUES (?, 2, ?, ?, ?, ?, ?, ?)
  `).run(
    "competition-1",
    "{\"schemaVersion\":1}",
    "subject-1",
    "00000000-0000-0000-0000-000000000001",
    "2026-08-22T23:05:00.000Z",
    "Edit",
    "operation-2"
  );

  const current = database.prepare("SELECT current_config_version AS version FROM competitions WHERE id = ?")
    .get("competition-1");
  assert.equal(current.version, 2);

  assert.throws(() => database.prepare(`
    INSERT INTO competition_config_versions (
      competition_id, version, config_json, created_by_subject,
      created_by_uuid, created_at, change_note, operation_id
    ) VALUES (?, 4, ?, ?, ?, ?, ?, ?)
  `).run(
    "competition-1",
    "{}",
    "subject-1",
    "00000000-0000-0000-0000-000000000001",
    "2026-08-22T23:06:00.000Z",
    "Stale jump",
    "operation-4"
  ), /stale_competition_config_version/);

  const unchanged = database.prepare("SELECT current_config_version AS version FROM competitions WHERE id = ?")
    .get("competition-1");
  assert.equal(unchanged.version, 2);
  database.close();
});

test("config save operation IDs cannot be reused", async () => {
  const database = await migratedDatabase();
  seedDraft(database);

  database.prepare(`
    INSERT INTO competition_config_versions (
      competition_id, version, config_json, created_by_subject,
      created_by_uuid, created_at, change_note, operation_id
    ) VALUES (?, 2, ?, ?, ?, ?, ?, ?)
  `).run(
    "competition-1", "{}", "subject-1",
    "00000000-0000-0000-0000-000000000001",
    "2026-08-22T23:05:00.000Z", "Edit", "operation-fixed"
  );

  assert.throws(() => database.prepare(`
    INSERT INTO competition_config_versions (
      competition_id, version, config_json, created_by_subject,
      created_by_uuid, created_at, change_note, operation_id
    ) VALUES (?, 3, ?, ?, ?, ?, ?, ?)
  `).run(
    "competition-1", "{}", "subject-1",
    "00000000-0000-0000-0000-000000000001",
    "2026-08-22T23:06:00.000Z", "Retry", "operation-fixed"
  ), /UNIQUE constraint failed/);

  database.close();
});

test("generic competition media only permits passed PNG/JPEG assets", async () => {
  const database = await migratedDatabase();
  seedDraft(database);

  database.prepare(`
    INSERT INTO competition_media (
      id, competition_id, purpose, storage_key, sha256, mime_type,
      byte_size, width, height, moderation_provider, moderation_model,
      moderation_outcome, created_by_uuid, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PASSED', ?, ?)
  `).run(
    "media-1",
    "competition-1",
    "BANNER",
    "competitions/banner/test.png",
    "a".repeat(64),
    "image/png",
    123,
    1280,
    720,
    "openai",
    "omni-moderation-latest",
    "00000000-0000-0000-0000-000000000001",
    "2026-08-22T23:10:00.000Z"
  );

  assert.throws(() => database.prepare(`
    INSERT INTO competition_media (
      id, competition_id, purpose, storage_key, sha256, mime_type,
      byte_size, width, height, moderation_provider, moderation_model,
      moderation_outcome, created_by_uuid, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "media-2",
    "competition-1",
    "BANNER",
    "competitions/banner/bad.webp",
    "b".repeat(64),
    "image/webp",
    123,
    1280,
    720,
    "openai",
    "omni-moderation-latest",
    "PASSED",
    "00000000-0000-0000-0000-000000000001",
    "2026-08-22T23:11:00.000Z"
  ), /CHECK constraint failed/);

  database.close();
});
