import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

async function databaseWithMigrations() {
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

function seed(database, state = "RESULTS_READY") {
  database.prepare(`
    INSERT INTO competitions (
      id, slug, title, category, lifecycle_state, current_config_version,
      created_by_subject, created_by_uuid, created_at, updated_at
    ) VALUES ('competition-1', 'draft-guard', 'Draft Guard', 'Build', ?, 1, 'subject', ?, ?, ?)
  `).run(
    state,
    "00000000-0000-0000-0000-000000000001",
    "2026-08-23T00:00:00.000Z",
    "2026-08-23T00:00:00.000Z"
  );
  database.prepare(`
    INSERT INTO competition_config_versions (
      competition_id, version, config_json, created_by_subject,
      created_by_uuid, created_at, change_note
    ) VALUES ('competition-1', 1, '{}', 'subject', ?, ?, 'Initial')
  `).run(
    "00000000-0000-0000-0000-000000000001",
    "2026-08-23T00:00:00.000Z"
  );
}

function submission(database, id, ownerUuid) {
  database.prepare(`
    INSERT INTO submissions (
      id, competition_id, entry_type, status, owner_subject, owner_uuid,
      owner_name, title, description, revision, staff_edited,
      created_at, updated_at, submitted_at, approved_at
    ) VALUES (?, 'competition-1', 'SOLO', 'APPROVED', ?, ?, 'Builder', ?, 'Description', 1, 0, ?, ?, ?, ?)
  `).run(
    id,
    `subject-${id}`,
    ownerUuid,
    `Entry ${id}`,
    "2026-08-23T00:01:00.000Z",
    "2026-08-23T00:02:00.000Z",
    "2026-08-23T00:02:00.000Z",
    "2026-08-23T00:03:00.000Z"
  );
}

function insertDraft(database, submissionId, placement) {
  database.prepare(`
    INSERT INTO competition_result_drafts (
      competition_id, submission_id, placement, final_score,
      community_component, judge_component, config_version,
      snapshot_json, computed_at, computed_by_uuid
    ) VALUES ('competition-1', ?, ?, 8, 8, NULL, 1, '{}', ?, ?)
  `).run(
    submissionId,
    placement,
    "2026-08-23T00:10:00.000Z",
    "00000000-0000-0000-0000-000000000002"
  );
}

function insertOperation(database, operationId = "operation-1") {
  database.prepare(`
    INSERT INTO competition_result_draft_operations (
      operation_id, competition_id, config_version, result_set_hash,
      created_by_uuid, created_at
    ) VALUES (?, 'competition-1', 1, ?, ?, ?)
  `).run(
    operationId,
    "a".repeat(64),
    "00000000-0000-0000-0000-000000000002",
    "2026-08-23T00:10:00.000Z"
  );
}

test("operation guard rejects result replacement outside RESULTS_READY", async () => {
  const database = await databaseWithMigrations();
  seed(database, "JUDGING");
  assert.throws(() => insertOperation(database), /wrong_state_or_config/);
  database.close();
});

test("finalize guard rejects an incomplete provisional set", async () => {
  const database = await databaseWithMigrations();
  seed(database);
  submission(database, "submission-1", "00000000-0000-0000-0000-000000000010");
  submission(database, "submission-2", "00000000-0000-0000-0000-000000000011");
  insertOperation(database);
  insertDraft(database, "submission-1", 1);

  assert.throws(() => database.prepare(`
    UPDATE competitions
    SET last_results_operation_id = 'operation-1'
    WHERE id = 'competition-1'
  `).run(), /result_drafts_incomplete/);
  database.close();
});

test("complete provisional set can finalize and replayed operation IDs are rejected", async () => {
  const database = await databaseWithMigrations();
  seed(database);
  submission(database, "submission-1", "00000000-0000-0000-0000-000000000010");
  submission(database, "submission-2", "00000000-0000-0000-0000-000000000011");
  insertOperation(database);
  insertDraft(database, "submission-1", 1);
  insertDraft(database, "submission-2", 2);

  database.prepare(`
    UPDATE competitions
    SET last_results_operation_id = 'operation-1'
    WHERE id = 'competition-1'
  `).run();
  assert.equal(
    database.prepare("SELECT last_results_operation_id AS id FROM competitions WHERE id = 'competition-1'").get().id,
    "operation-1"
  );

  assert.throws(() => database.prepare(`
    UPDATE competitions
    SET last_results_operation_id = 'operation-1'
    WHERE id = 'competition-1'
  `).run(), /operation_replay/);
  assert.throws(() => insertOperation(database, "operation-1"), /UNIQUE constraint failed/);
  database.close();
});

test("failed finalize rolls back operation and partial draft replacement inside a transaction", async () => {
  const database = await databaseWithMigrations();
  seed(database);
  submission(database, "submission-1", "00000000-0000-0000-0000-000000000010");
  submission(database, "submission-2", "00000000-0000-0000-0000-000000000011");

  insertOperation(database, "old-operation");
  insertDraft(database, "submission-1", 1);
  insertDraft(database, "submission-2", 2);
  database.prepare("UPDATE competitions SET last_results_operation_id = 'old-operation' WHERE id = 'competition-1'").run();

  database.exec("BEGIN");
  try {
    insertOperation(database, "new-operation");
    database.prepare("DELETE FROM competition_result_drafts WHERE competition_id = 'competition-1'").run();
    insertDraft(database, "submission-1", 1);
    assert.throws(() => database.prepare(`
      UPDATE competitions
      SET last_results_operation_id = 'new-operation'
      WHERE id = 'competition-1'
    `).run(), /result_drafts_incomplete/);
    database.exec("ROLLBACK");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM competition_result_drafts WHERE competition_id = 'competition-1'").get().count,
    2
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM competition_result_draft_operations WHERE operation_id = 'new-operation'").get().count,
    0
  );
  database.close();
});
