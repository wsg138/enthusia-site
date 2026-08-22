import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  for (const file of [
    "0001_competitions.sql",
    "0002_competition_config_version_triggers.sql",
    "0003_competition_config_operation_ids.sql",
    "0004_competition_visibility.sql"
  ]) {
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

test("competition migrations apply cleanly to SQLite", async () => {
  const database = await migratedDatabase();
  const tables = database.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'competition%'
  `).all();
  assert.ok(tables.some((row) => row.name === "competitions"));
  assert.ok(tables.some((row) => row.name === "competition_config_versions"));
  assert.ok(tables.some((row) => row.name === "competition_audit_events"));
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
