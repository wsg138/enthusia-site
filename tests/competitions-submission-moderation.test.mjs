import assert from "node:assert/strict";
import test from "node:test";
import {
  moderateSubmission,
  setSubmissionFlag
} from "../functions/lib/competitions/staff-submissions.js";
import { d1, migratedDatabase } from "./support/d1-sqlite.mjs";

const COMPETITION_ID = "10000000-0000-4000-8000-000000000021";
const SUBMISSION_ID = "20000000-0000-4000-8000-000000000022";
const OWNER_UUID = "30000000-0000-4000-8000-000000000023";
const REVIEWER_UUID = "40000000-0000-4000-8000-000000000024";
const IMAGE_ID = "50000000-0000-4000-8000-000000000025";
const DISCORD_ID = "3".repeat(18);
const OWNER_SUBJECT = `discord:${DISCORD_ID}`;
const NOW = "2026-08-28T15:00:00.000Z";

async function seededDatabase(submissionStatus = "PENDING_REVIEW") {
  const database = await migratedDatabase();
  database.prepare(`
    INSERT INTO competitions (
      id, slug, title, category, lifecycle_state, current_config_version,
      created_by_subject, created_by_uuid, created_at, updated_at
    ) VALUES (?, 'moderation-guards', 'Moderation Guards', 'Build', 'REVIEW', 1, 'owner', ?, ?, ?)
  `).run(COMPETITION_ID, OWNER_UUID, NOW, NOW);
  database.prepare(`
    INSERT INTO competition_config_versions (
      competition_id, version, config_json, created_by_subject,
      created_by_uuid, created_at, change_note
    ) VALUES (?, 1, '{}', 'owner', ?, ?, 'Initial')
  `).run(COMPETITION_ID, OWNER_UUID, NOW);
  database.prepare(`
    INSERT INTO competition_discord_accounts (
      discord_user_id, username, created_at, updated_at
    ) VALUES (?, 'Owner', ?, ?)
  `).run(DISCORD_ID, NOW, NOW);
  database.prepare(`
    INSERT INTO competition_minecraft_links (
      minecraft_uuid, discord_user_id, minecraft_name, linked_at, updated_at
    ) VALUES (?, ?, 'Owner', ?, ?)
  `).run(OWNER_UUID, DISCORD_ID, NOW, NOW);
  database.prepare(`
    INSERT INTO submissions (
      id, competition_id, entry_type, status, owner_subject, owner_uuid,
      owner_name, title, description, revision, created_at, updated_at,
      submitted_at
    ) VALUES (?, ?, 'SOLO', ?, ?, ?, 'Owner', 'Entry', 'Description', 1, ?, ?, ?)
  `).run(
    SUBMISSION_ID,
    COMPETITION_ID,
    submissionStatus,
    OWNER_SUBJECT,
    OWNER_UUID,
    NOW,
    NOW,
    NOW
  );
  return database;
}

function insertPassedImage(database) {
  database.prepare(`
    INSERT INTO submission_images (
      id, submission_id, sort_order, storage_key, sha256, mime_type,
      byte_size, width, height, moderation_state, created_at
    ) VALUES (?, ?, 0, ?, ?, 'image/png', 100, 16, 16, 'PASSED', ?)
  `).run(
    IMAGE_ID,
    SUBMISSION_ID,
    `competitions/${COMPETITION_ID}/submissions/${IMAGE_ID}.png`,
    "a".repeat(64),
    NOW
  );
}

function insertLocation(database) {
  database.prepare(`
    INSERT INTO submission_private_locations (
      submission_id, world_name, block_x, block_y, block_z,
      exact_coordinates_confirmed, updated_at
    ) VALUES (?, 'world', 1, 64, 2, 1, ?)
  `).run(SUBMISSION_ID, NOW);
}

function decision(overrides = {}) {
  return {
    competitionId: COMPETITION_ID,
    submissionId: SUBMISSION_ID,
    previousStatus: "PENDING_REVIEW",
    action: "APPROVE",
    publicReason: null,
    privateNote: "Reviewed",
    reviewerUuid: REVIEWER_UUID,
    actorSubject: "staff:reviewer",
    reviewedAt: "2026-08-28T15:01:00.000Z",
    expectedConfigVersion: 1,
    minImages: 1,
    coordinatesRequested: true,
    auditEventId: "60000000-0000-4000-8000-000000000026",
    ...overrides
  };
}

function moderationCount(database) {
  return database.prepare("SELECT COUNT(*) AS count FROM submission_moderation").get().count;
}

function auditCount(database) {
  return database.prepare("SELECT COUNT(*) AS count FROM competition_audit_events").get().count;
}

test("approval records the reviewed state and exact before status", async () => {
  const database = await seededDatabase();
  insertPassedImage(database);
  insertLocation(database);

  const result = await moderateSubmission(d1(database), decision());

  assert.deepEqual(result, { status: "UPDATED", submissionStatus: "APPROVED" });
  const submission = database.prepare(`
    SELECT status, approved_at AS approvedAt FROM submissions WHERE id = ?
  `).get(SUBMISSION_ID);
  assert.equal(submission.status, "APPROVED");
  assert.equal(submission.approvedAt, "2026-08-28T15:01:00.000Z");
  assert.equal(moderationCount(database), 1);
  const audit = database.prepare(`
    SELECT before_json AS beforeJson, after_json AS afterJson
    FROM competition_audit_events
  `).get();
  assert.deepEqual(JSON.parse(audit.beforeJson), { status: "PENDING_REVIEW" });
  assert.deepEqual(JSON.parse(audit.afterJson), { status: "APPROVED" });
  database.close();
});

test("approval rechecks image moderation inside the status write", async () => {
  const database = await seededDatabase();
  insertPassedImage(database);
  insertLocation(database);

  const result = await moderateSubmission(d1(database, {
    beforeBatch(current) {
      current.prepare("UPDATE submission_images SET moderation_state = 'REVIEW' WHERE id = ?").run(IMAGE_ID);
    }
  }), decision());

  assert.deepEqual(result, { status: "CONFLICT" });
  assert.equal(database.prepare("SELECT status FROM submissions WHERE id = ?").get(SUBMISSION_ID).status, "PENDING_REVIEW");
  assert.equal(moderationCount(database), 0);
  assert.equal(auditCount(database), 0);
  database.close();
});

test("moderation stops when the competition config changes before the write", async () => {
  const database = await seededDatabase();
  insertPassedImage(database);
  insertLocation(database);

  const result = await moderateSubmission(d1(database, {
    beforeBatch(current) {
      current.prepare("UPDATE competitions SET current_config_version = 2 WHERE id = ?").run(COMPETITION_ID);
    }
  }), decision());

  assert.deepEqual(result, { status: "CONFLICT" });
  assert.equal(moderationCount(database), 0);
  assert.equal(auditCount(database), 0);
  database.close();
});

test("a stale disqualification cannot overwrite a newly approved state", async () => {
  const database = await seededDatabase();
  const result = await moderateSubmission(d1(database, {
    beforeBatch(current) {
      current.prepare("UPDATE submissions SET status = 'APPROVED' WHERE id = ?").run(SUBMISSION_ID);
    }
  }), decision({
    action: "DISQUALIFY",
    publicReason: "Rule violation"
  }));

  assert.deepEqual(result, { status: "CONFLICT" });
  assert.equal(database.prepare("SELECT status FROM submissions WHERE id = ?").get(SUBMISSION_ID).status, "APPROVED");
  assert.equal(moderationCount(database), 0);
  assert.equal(auditCount(database), 0);
  database.close();
});

test("non-approval decisions do not require approval media", async () => {
  const database = await seededDatabase();
  const result = await moderateSubmission(d1(database), decision({
    action: "NEEDS_CHANGES",
    publicReason: "Please add clearer screenshots"
  }));

  assert.deepEqual(result, { status: "UPDATED", submissionStatus: "NEEDS_CHANGES" });
  assert.equal(database.prepare("SELECT status FROM submissions WHERE id = ?").get(SUBMISSION_ID).status, "NEEDS_CHANGES");
  assert.equal(moderationCount(database), 1);
  assert.equal(auditCount(database), 1);
  database.close();
});

test("staff flags and clears private review markers with matching audits", async () => {
  const database = await seededDatabase();
  assert.equal(await setSubmissionFlag(d1(database), {
    competitionId: COMPETITION_ID,
    submissionId: SUBMISSION_ID,
    actorSubject: "staff:reviewer",
    actorUuid: REVIEWER_UUID,
    flagged: true,
    reason: "Check build ownership",
    changedAt: "2026-08-28T15:02:00.000Z",
    auditEventId: "70000000-0000-4000-8000-000000000027"
  }), true);
  assert.deepEqual({ ...database.prepare(`
    SELECT flag_reason AS reason, flagged_by_uuid AS actorUuid
    FROM submission_moderation
    WHERE submission_id = ?
  `).get(SUBMISSION_ID) }, {
    reason: "Check build ownership",
    actorUuid: REVIEWER_UUID
  });

  assert.equal(await setSubmissionFlag(d1(database), {
    competitionId: COMPETITION_ID,
    submissionId: SUBMISSION_ID,
    actorSubject: "staff:reviewer",
    actorUuid: REVIEWER_UUID,
    flagged: false,
    changedAt: "2026-08-28T15:03:00.000Z",
    auditEventId: "80000000-0000-4000-8000-000000000028"
  }), true);
  assert.equal(database.prepare(`
    SELECT flag_reason AS reason FROM submission_moderation WHERE submission_id = ?
  `).get(SUBMISSION_ID).reason, null);
  assert.equal(auditCount(database), 2);
  database.close();
});
