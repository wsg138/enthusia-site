import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  const directory = new URL("../migrations/", import.meta.url);
  const files = (await readdir(directory))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
  for (const file of files) {
    database.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  }
  return database;
}

function seedCompetition(database) {
  database.prepare(`
    INSERT INTO competitions (
      id, slug, title, category, lifecycle_state, current_config_version,
      created_by_subject, created_by_uuid, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'RESULTS_READY', 1, ?, ?, ?, ?)
  `).run(
    "competition-1",
    "result-test",
    "Result Test",
    "Build",
    "subject-1",
    "00000000-0000-0000-0000-000000000001",
    "2026-08-23T00:00:00.000Z",
    "2026-08-23T00:00:00.000Z"
  );
  database.prepare(`
    INSERT INTO competition_config_versions (
      competition_id, version, config_json, created_by_subject,
      created_by_uuid, created_at, change_note
    ) VALUES (?, 1, '{}', ?, ?, ?, 'Initial')
  `).run(
    "competition-1",
    "subject-1",
    "00000000-0000-0000-0000-000000000001",
    "2026-08-23T00:00:00.000Z"
  );
}

function seedApprovedSubmission(database, id = "submission-1") {
  database.prepare(`
    INSERT INTO submissions (
      id, competition_id, entry_type, status, owner_subject, owner_uuid,
      owner_name, title, description, revision, staff_edited,
      created_at, updated_at, submitted_at, approved_at
    ) VALUES (?, 'competition-1', 'SOLO', 'APPROVED', ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?)
  `).run(
    id,
    `subject-${id}`,
    "00000000-0000-0000-0000-000000000010",
    "Builder",
    "Entry",
    "Entry description",
    "2026-08-23T00:01:00.000Z",
    "2026-08-23T00:02:00.000Z",
    "2026-08-23T00:02:00.000Z",
    "2026-08-23T00:03:00.000Z"
  );
}

test("database refuses COMPLETED when approved entries do not all have permanent results", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  seedApprovedSubmission(database);

  assert.throws(
    () => database.prepare("UPDATE competitions SET lifecycle_state = 'COMPLETED' WHERE id = 'competition-1'").run(),
    /competition_results_incomplete/
  );
  assert.equal(
    database.prepare("SELECT lifecycle_state AS state FROM competitions WHERE id = 'competition-1'").get().state,
    "RESULTS_READY"
  );
  database.close();
});

test("database permits COMPLETED only after a current-version result exists for every approved entry", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  seedApprovedSubmission(database);

  database.prepare(`
    INSERT INTO competition_results (
      competition_id, submission_id, placement, final_score,
      community_component, judge_component, config_version,
      snapshot_json, published_at
    ) VALUES ('competition-1', 'submission-1', 1, 9.5, 9, 10, 1, ?, ?)
  `).run(
    JSON.stringify({ formulaVersion: "test-v1", inputs: { votes: 9 } }),
    "2026-08-23T00:10:00.000Z"
  );

  database.prepare("UPDATE competitions SET lifecycle_state = 'COMPLETED' WHERE id = 'competition-1'").run();
  assert.equal(
    database.prepare("SELECT lifecycle_state AS state FROM competitions WHERE id = 'competition-1'").get().state,
    "COMPLETED"
  );
  database.close();
});

test("database refuses completion when a permanent result was computed against a stale config version", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  seedApprovedSubmission(database);

  database.prepare("UPDATE competitions SET current_config_version = 2 WHERE id = 'competition-1'").run();
  database.prepare(`
    INSERT INTO competition_results (
      competition_id, submission_id, placement, final_score,
      community_component, judge_component, config_version,
      snapshot_json, published_at
    ) VALUES ('competition-1', 'submission-1', 1, 8, 8, NULL, 1, '{}', ?)
  `).run("2026-08-23T00:10:00.000Z");

  assert.throws(
    () => database.prepare("UPDATE competitions SET lifecycle_state = 'COMPLETED' WHERE id = 'competition-1'").run(),
    /competition_results_stale_config/
  );
  database.close();
});
