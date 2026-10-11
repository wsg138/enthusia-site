import assert from "node:assert/strict";
import test from "node:test";

import { createSubmissionDraft } from "../functions/lib/competitions/submission-creation.js";
import { d1, migratedDatabase } from "./support/d1-sqlite.mjs";

const COMPETITION_ID = "11000000-0000-4000-8000-000000000001";
const SUBMISSION_ID = "21000000-0000-4000-8000-000000000001";
const OWNER_UUID = "31000000-0000-4000-8000-000000000001";
const ACTOR_UUID = "41000000-0000-4000-8000-000000000001";
const DISCORD_ID = "2".repeat(18);
const NOW = "2026-08-29T13:00:00.000Z";

function competitionConfig({
  allowedTypes = ["SOLO", "GROUP", "GUILD"],
  maxEntriesPerPlayer = 1,
  maxEntriesPerGuild = 1
} = {}) {
  return {
    entries: {
      allowedTypes,
      maxEntriesPerPlayer,
      maxEntriesPerGuild
    }
  };
}

function seedCompetition(database, config = competitionConfig()) {
  database.prepare(`
    INSERT INTO competitions (
      id, slug, title, category, lifecycle_state, current_config_version,
      created_by_subject, created_by_uuid, created_at, updated_at
    ) VALUES (?, 'submission-creation', 'Submission Creation', 'Build', 'SUBMISSIONS_OPEN', 1, ?, ?, ?, ?)
  `).run(COMPETITION_ID, `discord:${DISCORD_ID}`, ACTOR_UUID, NOW, NOW);
  database.prepare(`
    INSERT INTO competition_config_versions (
      competition_id, version, config_json, created_by_subject,
      created_by_uuid, created_at, change_note
    ) VALUES (?, 1, ?, ?, ?, ?, 'Initial')
  `).run(COMPETITION_ID, JSON.stringify(config), `discord:${DISCORD_ID}`, ACTOR_UUID, NOW);
}

function seedOwnerIdentity(database) {
  database.prepare(`
    INSERT INTO competition_discord_accounts (
      discord_user_id, username, created_at, updated_at
    ) VALUES (?, 'builder', ?, ?)
  `).run(DISCORD_ID, NOW, NOW);
  database.prepare(`
    INSERT INTO competition_minecraft_links (
      minecraft_uuid, discord_user_id, minecraft_name, linked_at, updated_at
    ) VALUES (?, ?, 'Builder', ?, ?)
  `).run(OWNER_UUID, DISCORD_ID, NOW, NOW);
}

function seed(database, config) {
  seedCompetition(database, config);
  seedOwnerIdentity(database);
}

function draft(overrides = {}) {
  return {
    id: SUBMISSION_ID,
    competitionId: COMPETITION_ID,
    expectedConfigVersion: 1,
    entryType: "SOLO",
    ownerSubject: `discord:${DISCORD_ID}`,
    ownerUuid: OWNER_UUID,
    ownerName: "Builder",
    guildId: null,
    guildName: null,
    title: "Village garden",
    description: "A garden built beside the village.",
    location: {
      worldName: "world",
      x: 24,
      y: 70,
      z: -18,
      exactCoordinatesConfirmed: true
    },
    createdAt: NOW,
    auditEventId: "61000000-0000-4000-8000-000000000001",
    ...overrides
  };
}

function creationCounts(database) {
  return database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM submissions) AS submissions,
      (SELECT COUNT(*) FROM submission_participants) AS participants,
      (SELECT COUNT(*) FROM submission_private_locations) AS locations,
      (SELECT COUNT(*) FROM competition_audit_events) AS auditEvents
  `).get();
}

function assertNoCreatedArtifacts(database) {
  const counts = creationCounts(database);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM submissions WHERE id = ?").get(SUBMISSION_ID).count, 0);
  assert.equal(counts.participants, 0);
  assert.equal(counts.locations, 0);
  assert.equal(counts.auditEvents, 0);
}

function seedExistingPlayerEntry(database, ownerUuid = OWNER_UUID) {
  database.prepare(`
    INSERT INTO submissions (
      id, competition_id, entry_type, status, owner_subject, owner_uuid,
      owner_name, title, description, revision, staff_edited, created_at, updated_at
    ) VALUES (
      'existing-player-entry', ?, 'SOLO', 'DRAFT', ?, ?,
      'Builder', 'Existing entry', 'Already uses the available slot.', 1, 0, ?, ?
    )
  `).run(COMPETITION_ID, `staff-manual:${ownerUuid}`, ownerUuid, NOW, NOW);
}

function seedExistingGuildEntry(database) {
  database.prepare(`
    INSERT INTO submissions (
      id, competition_id, entry_type, status, owner_subject, owner_uuid,
      owner_name, guild_id, guild_name_snapshot, title, description,
      revision, staff_edited, created_at, updated_at
    ) VALUES (
      'existing-guild-entry', ?, 'GUILD', 'DRAFT', 'staff-manual:guild', ?,
      'GuildOwner', 'builders', 'Builders', 'Existing guild entry',
      'Already uses the available guild slot.', 1, 0, ?, ?
    )
  `).run(COMPETITION_ID, ACTOR_UUID, NOW, NOW);
}

test("draft creation atomically persists a solo entry and its dependent records", async () => {
  const database = await migratedDatabase();
  seed(database);

  const result = await createSubmissionDraft(d1(database), draft());

  assert.deepEqual(result, { status: "CREATED", id: SUBMISSION_ID });
  assert.deepEqual({ ...creationCounts(database) }, {
    submissions: 1,
    participants: 1,
    locations: 1,
    auditEvents: 1
  });
  database.close();
});

test("draft creation conflicts if submissions close before the write batch", async () => {
  const database = await migratedDatabase();
  seed(database);
  const binding = d1(database, {
    beforeBatch(current) {
      current.prepare("UPDATE competitions SET lifecycle_state = 'REVIEW' WHERE id = ?").run(COMPETITION_ID);
    }
  });

  assert.deepEqual(await createSubmissionDraft(binding, draft()), { status: "CONFLICT" });
  assertNoCreatedArtifacts(database);
  database.close();
});

test("draft creation conflicts when its validated config version becomes stale", async () => {
  const database = await migratedDatabase();
  seed(database);
  const binding = d1(database, {
    beforeBatch(current) {
      current.prepare(`
        INSERT INTO competition_config_versions (
          competition_id, version, config_json, created_by_subject,
          created_by_uuid, created_at, change_note
        ) VALUES (?, 2, ?, ?, ?, ?, 'Changed while creating entry')
      `).run(
        COMPETITION_ID,
        JSON.stringify(competitionConfig()),
        `discord:${DISCORD_ID}`,
        ACTOR_UUID,
        NOW
      );
    }
  });

  assert.deepEqual(await createSubmissionDraft(binding, draft()), { status: "CONFLICT" });
  assertNoCreatedArtifacts(database);
  database.close();
});

test("draft creation enforces the player entry cap inside the write batch", async () => {
  const database = await migratedDatabase();
  seed(database);
  const binding = d1(database, {
    beforeBatch(current) {
      seedExistingPlayerEntry(current);
    }
  });

  assert.deepEqual(await createSubmissionDraft(binding, draft()), { status: "CONFLICT" });
  assert.equal(creationCounts(database).submissions, 1);
  assertNoCreatedArtifacts(database);
  database.close();
});

test("draft creation enforces linked-account entry slots inside the write batch", async () => {
  const database = await migratedDatabase();
  seed(database);
  const linkedUuid = "31000000-0000-4000-8000-000000000002";
  database.prepare(`
    INSERT INTO competition_minecraft_links (
      minecraft_uuid, discord_user_id, minecraft_name, linked_at, updated_at
    ) VALUES (?, ?, 'BuilderAlt', ?, ?)
  `).run(linkedUuid, DISCORD_ID, NOW, NOW);
  seedExistingPlayerEntry(database, linkedUuid);

  assert.deepEqual(await createSubmissionDraft(d1(database), draft()), { status: "CONFLICT" });
  assert.equal(creationCounts(database).submissions, 1);
  assertNoCreatedArtifacts(database);
  database.close();
});

test("draft creation enforces the guild entry cap inside the write batch", async () => {
  const database = await migratedDatabase();
  seed(database);
  const guildDraft = draft({
    entryType: "GUILD",
    guildId: "builders",
    guildName: "Builders",
    location: null
  });
  const binding = d1(database, {
    beforeBatch(current) {
      seedExistingGuildEntry(current);
    }
  });

  assert.deepEqual(await createSubmissionDraft(binding, guildDraft), { status: "CONFLICT" });
  assert.equal(creationCounts(database).submissions, 1);
  assertNoCreatedArtifacts(database);
  database.close();
});

test("draft creation rejects an entry type removed from the current config", async () => {
  const database = await migratedDatabase();
  seed(database, competitionConfig({ allowedTypes: ["GROUP"] }));

  assert.deepEqual(await createSubmissionDraft(d1(database), draft()), { status: "CONFLICT" });
  assertNoCreatedArtifacts(database);
  database.close();
});
