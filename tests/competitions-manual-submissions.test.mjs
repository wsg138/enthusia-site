import assert from "node:assert/strict";
import test from "node:test";

import { createManualSoloSubmission } from "../functions/lib/competitions/manual-submissions.js";
import { d1, migratedDatabase } from "./support/d1-sqlite.mjs";

const COMPETITION_ID = "10000000-0000-4000-8000-000000000001";
const SUBMISSION_ID = "20000000-0000-4000-8000-000000000001";
const OWNER_UUID = "30000000-0000-4000-8000-000000000001";
const ACTOR_UUID = "40000000-0000-4000-8000-000000000001";
const NOW = "2026-08-29T12:00:00.000Z";

function config({ allowedTypes = ["SOLO"], maxEntriesPerPlayer = 1 } = {}) {
  return {
    entries: {
      allowedTypes,
      maxEntriesPerPlayer
    }
  };
}

function seedCompetition(database, competitionConfig = config()) {
  database.prepare(`
    INSERT INTO competitions (
      id, slug, title, category, lifecycle_state, current_config_version,
      created_by_subject, created_by_uuid, created_at, updated_at
    ) VALUES (?, 'manual-entry', 'Manual Entry', 'Build', 'SUBMISSIONS_OPEN', 1, 'staff:creator', ?, ?, ?)
  `).run(COMPETITION_ID, ACTOR_UUID, NOW, NOW);
  database.prepare(`
    INSERT INTO competition_config_versions (
      competition_id, version, config_json, created_by_subject,
      created_by_uuid, created_at, change_note
    ) VALUES (?, 1, ?, 'staff:creator', ?, ?, 'Initial')
  `).run(COMPETITION_ID, JSON.stringify(competitionConfig), ACTOR_UUID, NOW);
}

function submission(overrides = {}) {
  return {
    id: SUBMISSION_ID,
    competitionId: COMPETITION_ID,
    competitionTitle: "Manual Entry",
    competitionSlug: "manual-entry",
    expectedConfigVersion: 1,
    ownerSubject: `staff-manual:${OWNER_UUID}`,
    ownerUuid: OWNER_UUID,
    ownerName: "Builder",
    title: "Garden build",
    description: "A landscaped garden beside the village.",
    location: {
      worldName: "world",
      x: 120,
      y: 68,
      z: -45
    },
    moderationChecks: [
      {
        id: "50000000-0000-4000-8000-000000000001",
        targetType: "TITLE",
        provider: "test",
        model: "test",
        outcome: "PASSED",
        categories: {},
        scores: {},
        contentHash: "title-hash"
      },
      {
        id: "50000000-0000-4000-8000-000000000002",
        targetType: "DESCRIPTION",
        provider: "test",
        model: "test",
        outcome: "PASSED",
        categories: {},
        scores: {},
        contentHash: "description-hash"
      }
    ],
    actorSubject: "staff:manager",
    actorUuid: ACTOR_UUID,
    auditEventId: "60000000-0000-4000-8000-000000000001",
    notificationId: "70000000-0000-4000-8000-000000000001",
    createdAt: NOW,
    note: "Staff created a manual entry for Builder",
    ...overrides
  };
}

function recordCounts(database) {
  return database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM submissions) AS submissions,
      (SELECT COUNT(*) FROM submission_participants) AS participants,
      (SELECT COUNT(*) FROM submission_private_locations) AS locations,
      (SELECT COUNT(*) FROM moderation_checks) AS moderationChecks,
      (SELECT COUNT(*) FROM competition_audit_events) AS auditEvents,
      (SELECT COUNT(*) FROM competition_notification_outbox) AS notifications
  `).get();
}

function seedActiveSubmission(database, ownerUuid = OWNER_UUID) {
  database.prepare(`
    INSERT INTO submissions (
      id, competition_id, entry_type, status, owner_subject, owner_uuid,
      owner_name, title, description, revision, staff_edited, created_at, updated_at
    ) VALUES (
      'existing-entry', ?, 'SOLO', 'DRAFT', ?, ?,
      'Existing', 'Existing entry', 'Already occupies the available slot.', 1, 1, ?, ?
    )
  `).run(COMPETITION_ID, `staff-manual:${ownerUuid}`, ownerUuid, NOW, NOW);
}

function assertNoAttemptArtifacts(database) {
  const counts = recordCounts(database);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM submissions WHERE id = ?").get(SUBMISSION_ID).count, 0);
  assert.equal(counts.moderationChecks, 0);
  assert.equal(counts.auditEvents, 0);
  assert.equal(counts.notifications, 0);
}

test("manual submission creation persists the entry and all dependent records", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);

  const result = await createManualSoloSubmission(d1(database), submission());

  assert.deepEqual(result, { status: "CREATED", id: SUBMISSION_ID });
  assert.deepEqual({ ...recordCounts(database) }, {
    submissions: 1,
    participants: 1,
    locations: 1,
    moderationChecks: 2,
    auditEvents: 1,
    notifications: 1
  });
  const stored = database.prepare(`
    SELECT status, owner_uuid AS ownerUuid, staff_edited AS staffEdited
    FROM submissions
    WHERE id = ?
  `).get(SUBMISSION_ID);
  assert.deepEqual({ ...stored }, {
    status: "PENDING_REVIEW",
    ownerUuid: OWNER_UUID,
    staffEdited: 1
  });
  database.close();
});

test("manual submission creation conflicts if the lifecycle closes before the batch", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  const binding = d1(database, {
    beforeBatch(current) {
      current.prepare("UPDATE competitions SET lifecycle_state = 'VOTING' WHERE id = ?").run(COMPETITION_ID);
    }
  });

  assert.deepEqual(await createManualSoloSubmission(binding, submission()), { status: "CONFLICT" });
  assertNoAttemptArtifacts(database);
  database.close();
});

test("manual submission creation conflicts if its config version becomes stale", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  const binding = d1(database, {
    beforeBatch(current) {
      current.prepare(`
        INSERT INTO competition_config_versions (
          competition_id, version, config_json, created_by_subject,
          created_by_uuid, created_at, change_note
        ) VALUES (?, 2, ?, 'staff:creator', ?, ?, 'Changed while creating entry')
      `).run(COMPETITION_ID, JSON.stringify(config()), ACTOR_UUID, NOW);
    }
  });

  assert.deepEqual(await createManualSoloSubmission(binding, submission()), { status: "CONFLICT" });
  assertNoAttemptArtifacts(database);
  assert.equal(database.prepare("SELECT current_config_version AS version FROM competitions").get().version, 2);
  database.close();
});

test("manual submission creation enforces the entry cap inside the write batch", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  const binding = d1(database, {
    beforeBatch(current) {
      seedActiveSubmission(current);
    }
  });

  assert.deepEqual(await createManualSoloSubmission(binding, submission()), { status: "CONFLICT" });
  assert.equal(recordCounts(database).submissions, 1);
  assertNoAttemptArtifacts(database);
  database.close();
});

test("manual submission creation counts entries held by a linked Minecraft account", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  const linkedUuid = "30000000-0000-4000-8000-000000000002";
  const discordId = "111111111111111111";
  database.prepare(`
    INSERT INTO competition_discord_accounts (
      discord_user_id, username, created_at, updated_at
    ) VALUES (?, 'builder', ?, ?)
  `).run(discordId, NOW, NOW);
  database.prepare(`
    INSERT INTO competition_minecraft_links (
      minecraft_uuid, discord_user_id, minecraft_name, linked_at, updated_at
    ) VALUES (?, ?, 'Builder', ?, ?), (?, ?, 'BuilderAlt', ?, ?)
  `).run(OWNER_UUID, discordId, NOW, NOW, linkedUuid, discordId, NOW, NOW);
  seedActiveSubmission(database, linkedUuid);

  assert.deepEqual(await createManualSoloSubmission(d1(database), submission()), { status: "CONFLICT" });
  assert.equal(recordCounts(database).submissions, 1);
  assertNoAttemptArtifacts(database);
  database.close();
});

test("manual submission creation rejects a current config without solo entries", async () => {
  const database = await migratedDatabase();
  seedCompetition(database, config({ allowedTypes: ["GROUP"] }));

  assert.deepEqual(await createManualSoloSubmission(d1(database), submission()), { status: "CONFLICT" });
  assertNoAttemptArtifacts(database);
  database.close();
});
