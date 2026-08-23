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
    ) VALUES (?, ?, ?, ?, 'SUBMISSIONS_OPEN', 1, ?, ?, ?, ?)
  `).run(
    "competition-1",
    "summer-build",
    "Summer Build",
    "Build",
    "subject-owner",
    "00000000-0000-4000-8000-000000000001",
    "2026-08-23T02:00:00.000Z",
    "2026-08-23T02:00:00.000Z"
  );
}

function seedSubmission(database, { status = "DRAFT" } = {}) {
  database.prepare(`
    INSERT INTO submissions (
      id, competition_id, entry_type, status, owner_subject, owner_uuid,
      owner_name, title, description, revision, created_at, updated_at
    ) VALUES (?, ?, 'GROUP', ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    "submission-1",
    "competition-1",
    status,
    "subject-owner",
    "00000000-0000-4000-8000-000000000001",
    "Builder",
    "Castle",
    "A castle entry",
    "2026-08-23T02:01:00.000Z",
    "2026-08-23T02:01:00.000Z"
  );
}

function seedPendingContributor(database) {
  database.prepare(`
    INSERT INTO submission_participants (
      submission_id, player_uuid, player_name, participant_role,
      invite_status, invited_by_uuid, invited_at, responded_at
    ) VALUES (?, ?, ?, 'HELPER', 'PENDING', ?, ?, NULL)
  `).run(
    "submission-1",
    "00000000-0000-4000-8000-000000000002",
    "Helper",
    "00000000-0000-4000-8000-000000000001",
    "2026-08-23T02:02:00.000Z"
  );
}

test("submission review transition atomically creates a durable staff notification", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  seedSubmission(database);

  database.prepare(`
    UPDATE submissions
    SET status = 'PENDING_REVIEW', revision = 2,
        submitted_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    "2026-08-23T02:05:00.000Z",
    "2026-08-23T02:05:00.000Z",
    "submission-1"
  );

  const row = database.prepare(`
    SELECT event_type AS eventType, operation_key AS operationKey, payload_json AS payloadJson
    FROM competition_notification_outbox
  `).get();
  assert.equal(row.eventType, "SUBMISSION_REVIEW");
  assert.equal(row.operationKey, "submission-review:submission-1:2");
  assert.deepEqual(JSON.parse(row.payloadJson), {
    competitionTitle: "Summer Build",
    competitionSlug: "summer-build",
    submissionTitle: "Castle",
    ownerName: "Builder",
    submissionId: "submission-1"
  });
  database.close();
});

test("responding to a pending contributor invite atomically queues reminder clearing", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  seedSubmission(database);
  seedPendingContributor(database);

  database.prepare(`
    UPDATE submission_participants
    SET invite_status = 'ACCEPTED', responded_at = ?
    WHERE submission_id = ? AND player_uuid = ?
  `).run(
    "2026-08-23T02:06:00.000Z",
    "submission-1",
    "00000000-0000-4000-8000-000000000002"
  );

  const row = database.prepare(`
    SELECT event_type AS eventType, recipient_uuid AS recipientUuid, payload_json AS payloadJson
    FROM competition_notification_outbox
  `).get();
  assert.equal(row.eventType, "CONTRIBUTOR_RESPONSE");
  assert.equal(row.recipientUuid, "00000000-0000-4000-8000-000000000002");
  assert.equal(JSON.parse(row.payloadJson).playerUuid, row.recipientUuid);
  database.close();
});

test("explicitly removing a pending contributor queues reminder clearing", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  seedSubmission(database);
  seedPendingContributor(database);

  database.prepare(`
    DELETE FROM submission_participants
    WHERE submission_id = ? AND player_uuid = ?
  `).run("submission-1", "00000000-0000-4000-8000-000000000002");

  const row = database.prepare(`
    SELECT event_type AS eventType, recipient_uuid AS recipientUuid
    FROM competition_notification_outbox
  `).get();
  assert.equal(row.eventType, "CONTRIBUTOR_RESPONSE");
  assert.equal(row.recipientUuid, "00000000-0000-4000-8000-000000000002");
  database.close();
});

test("cascading submission deletion does not create orphan contributor notifications", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  seedSubmission(database);
  seedPendingContributor(database);

  database.prepare("DELETE FROM submissions WHERE id = ?").run("submission-1");
  const row = database.prepare("SELECT COUNT(*) AS count FROM competition_notification_outbox").get();
  assert.equal(row.count, 0);
  database.close();
});
