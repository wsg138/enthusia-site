import assert from "node:assert/strict";
import test from "node:test";
import { updateOwnedSubmissionDraft } from "../functions/lib/competitions/submission-edit.js";
import {
  submitSubmissionForReview,
  withdrawSubmission
} from "../functions/lib/competitions/submissions.js";
import { d1, migratedDatabase } from "./support/d1-sqlite.mjs";

const COMPETITION_ID = "10000000-0000-4000-8000-000000000011";
const SUBMISSION_ID = "20000000-0000-4000-8000-000000000012";
const OWNER_UUID = "30000000-0000-4000-8000-000000000013";
const IMAGE_ID = "40000000-0000-4000-8000-000000000014";
const DISCORD_ID = "2".repeat(18);
const OWNER_SUBJECT = `discord:${DISCORD_ID}`;
const NOW = "2026-08-28T14:00:00.000Z";

async function seededDatabase({
  lifecycleState = "SUBMISSIONS_OPEN",
  submissionStatus = "DRAFT"
} = {}) {
  const database = await migratedDatabase();
  database.prepare(`
    INSERT INTO competitions (
      id, slug, title, category, lifecycle_state, current_config_version,
      created_by_subject, created_by_uuid, created_at, updated_at
    ) VALUES (?, 'transition-guards', 'Transition Guards', 'Build', ?, 1, 'owner', ?, ?, ?)
  `).run(COMPETITION_ID, lifecycleState, OWNER_UUID, NOW, NOW);
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
      owner_name, title, description, revision, created_at, updated_at
    ) VALUES (?, ?, 'SOLO', ?, ?, ?, 'Owner', 'Original', 'Original description', 1, ?, ?)
  `).run(
    SUBMISSION_ID,
    COMPETITION_ID,
    submissionStatus,
    OWNER_SUBJECT,
    OWNER_UUID,
    NOW,
    NOW
  );
  return database;
}

function draftUpdate(overrides = {}) {
  return {
    competitionId: COMPETITION_ID,
    submissionId: SUBMISSION_ID,
    ownerSubject: OWNER_SUBJECT,
    actorUuid: OWNER_UUID,
    expectedRevision: 1,
    expectedConfigVersion: 1,
    reviewCloseAt: null,
    title: "Updated",
    description: "Updated description",
    location: null,
    clearLocation: true,
    updatedAt: "2026-08-28T14:01:00.000Z",
    auditEventId: "50000000-0000-4000-8000-000000000015",
    ...overrides
  };
}

function reviewSubmission(overrides = {}) {
  return {
    competitionId: COMPETITION_ID,
    submissionId: SUBMISSION_ID,
    ownerSubject: OWNER_SUBJECT,
    actorUuid: OWNER_UUID,
    expectedRevision: 1,
    expectedConfigVersion: 1,
    reviewCloseAt: null,
    minImages: 0,
    coordinatesRequested: false,
    submittedAt: "2026-08-28T14:02:00.000Z",
    auditEventId: "60000000-0000-4000-8000-000000000016",
    ...overrides
  };
}

function insertImage(database, moderationState = "PASSED") {
  database.prepare(`
    INSERT INTO submission_images (
      id, submission_id, sort_order, storage_key, sha256, mime_type,
      byte_size, width, height, moderation_state, created_at
    ) VALUES (?, ?, 0, ?, ?, 'image/png', 100, 16, 16, ?, ?)
  `).run(
    IMAGE_ID,
    SUBMISSION_ID,
    `competitions/${COMPETITION_ID}/submissions/${IMAGE_ID}.png`,
    "a".repeat(64),
    moderationState,
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

function submissionRow(database) {
  return { ...database.prepare(`
    SELECT status, title, revision, submitted_at AS submittedAt,
           withdrawn_at AS withdrawnAt
    FROM submissions
    WHERE id = ?
  `).get(SUBMISSION_ID) };
}

function auditCount(database) {
  return database.prepare("SELECT COUNT(*) AS count FROM competition_audit_events").get().count;
}

test("draft updates stop when the competition locks before the database batch", async () => {
  const database = await seededDatabase();
  const result = await updateOwnedSubmissionDraft(d1(database, {
    beforeBatch(current) {
      current.prepare("UPDATE competitions SET lifecycle_state = 'VOTING' WHERE id = ?").run(COMPETITION_ID);
    }
  }), draftUpdate());

  assert.deepEqual(result, { status: "CONFLICT" });
  assert.deepEqual(submissionRow(database), {
    status: "DRAFT",
    title: "Original",
    revision: 1,
    submittedAt: null,
    withdrawnAt: null
  });
  assert.equal(auditCount(database), 0);
  database.close();
});

test("changes requested after the review deadline cannot update the draft", async () => {
  const database = await seededDatabase({
    lifecycleState: "REVIEW",
    submissionStatus: "NEEDS_CHANGES"
  });
  const result = await updateOwnedSubmissionDraft(d1(database), draftUpdate({
    reviewCloseAt: "2026-08-28T14:00:30.000Z",
    updatedAt: "2026-08-28T14:01:00.000Z"
  }));

  assert.deepEqual(result, { status: "CONFLICT" });
  assert.equal(submissionRow(database).title, "Original");
  assert.equal(auditCount(database), 0);
  database.close();
});

test("submission stops when the competition locks before the database batch", async () => {
  const database = await seededDatabase();
  const result = await submitSubmissionForReview(d1(database, {
    beforeBatch(current) {
      current.prepare("UPDATE competitions SET lifecycle_state = 'VOTING' WHERE id = ?").run(COMPETITION_ID);
    }
  }), reviewSubmission());

  assert.deepEqual(result, { status: "CONFLICT" });
  assert.equal(submissionRow(database).status, "DRAFT");
  assert.equal(auditCount(database), 0);
  database.close();
});

test("submission rechecks required images, moderation, and coordinates in the write", async (t) => {
  await t.test("minimum image count", async () => {
    const database = await seededDatabase();
    assert.deepEqual(
      await submitSubmissionForReview(d1(database), reviewSubmission({ minImages: 1 })),
      { status: "CONFLICT" }
    );
    assert.equal(auditCount(database), 0);
    database.close();
  });

  await t.test("image moderation", async () => {
    const database = await seededDatabase();
    insertImage(database, "REVIEW");
    assert.deepEqual(
      await submitSubmissionForReview(d1(database), reviewSubmission({ minImages: 1 })),
      { status: "CONFLICT" }
    );
    assert.equal(auditCount(database), 0);
    database.close();
  });

  await t.test("exact coordinates", async () => {
    const database = await seededDatabase();
    insertImage(database);
    assert.deepEqual(
      await submitSubmissionForReview(d1(database), reviewSubmission({
        minImages: 1,
        coordinatesRequested: true
      })),
      { status: "CONFLICT" }
    );
    assert.equal(auditCount(database), 0);
    database.close();
  });
});

test("a valid submission transition records the state and audit atomically", async () => {
  const database = await seededDatabase();
  insertImage(database);
  insertLocation(database);

  const result = await submitSubmissionForReview(d1(database), reviewSubmission({
    minImages: 1,
    coordinatesRequested: true
  }));

  assert.deepEqual(result, { status: "SUBMITTED", revision: 2 });
  assert.deepEqual(submissionRow(database), {
    status: "PENDING_REVIEW",
    title: "Original",
    revision: 2,
    submittedAt: "2026-08-28T14:02:00.000Z",
    withdrawnAt: null
  });
  assert.equal(auditCount(database), 1);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM competition_discord_outbox").get().count,
    1
  );
  database.close();
});

test("withdrawal stops when the competition locks before the database batch", async () => {
  const database = await seededDatabase({ submissionStatus: "PENDING_REVIEW" });
  const withdrawn = await withdrawSubmission(d1(database, {
    beforeBatch(current) {
      current.prepare("UPDATE competitions SET lifecycle_state = 'VOTING' WHERE id = ?").run(COMPETITION_ID);
    }
  }), {
    competitionId: COMPETITION_ID,
    submissionId: SUBMISSION_ID,
    ownerSubject: OWNER_SUBJECT,
    actorUuid: OWNER_UUID,
    expectedConfigVersion: 1,
    withdrawnAt: "2026-08-28T14:03:00.000Z",
    auditEventId: "70000000-0000-4000-8000-000000000017"
  });

  assert.equal(withdrawn, false);
  assert.equal(submissionRow(database).status, "PENDING_REVIEW");
  assert.equal(auditCount(database), 0);
  database.close();
});
