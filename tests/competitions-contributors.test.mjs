import assert from "node:assert/strict";
import test from "node:test";
import {
  inviteSubmissionContributor,
  removeSubmissionContributor,
  respondSubmissionInvite
} from "../functions/lib/competitions/contributors.js";
import { d1, migratedDatabase } from "./support/d1-sqlite.mjs";

const COMPETITION_ID = "10000000-0000-4000-8000-000000000001";
const SUBMISSION_ID = "20000000-0000-4000-8000-000000000002";
const OWNER_UUID = "30000000-0000-4000-8000-000000000003";
const EXISTING_UUID = "40000000-0000-4000-8000-000000000004";
const INVITED_UUID = "50000000-0000-4000-8000-000000000005";
const NOW = "2026-08-28T13:00:00.000Z";

async function seededDatabase() {
  const database = await migratedDatabase();
  database.prepare(`
    INSERT INTO competitions (
      id, slug, title, category, lifecycle_state, current_config_version,
      created_by_subject, created_by_uuid, created_at, updated_at
    ) VALUES (?, 'role-limit', 'Role Limit', 'Build', 'SUBMISSIONS_OPEN', 1, 'owner', ?, ?, ?)
  `).run(COMPETITION_ID, OWNER_UUID, NOW, NOW);
  database.prepare(`
    INSERT INTO competition_config_versions (
      competition_id, version, config_json, created_by_subject,
      created_by_uuid, created_at, change_note
    ) VALUES (?, 1, '{}', 'owner', ?, ?, 'Initial')
  `).run(COMPETITION_ID, OWNER_UUID, NOW);
  database.prepare(`
    INSERT INTO submissions (
      id, competition_id, entry_type, status, owner_subject, owner_uuid,
      owner_name, title, description, revision, created_at, updated_at
    ) VALUES (?, ?, 'GROUP', 'DRAFT', 'owner', ?, 'Owner', 'Entry', 'Description', 1, ?, ?)
  `).run(SUBMISSION_ID, COMPETITION_ID, OWNER_UUID, NOW, NOW);
  database.prepare(`
    INSERT INTO submission_participants (
      submission_id, player_uuid, player_name, participant_role,
      invite_status, invited_by_uuid, invited_at, responded_at
    ) VALUES (?, ?, 'Existing', 'MAIN', 'PENDING', ?, ?, NULL)
  `).run(SUBMISSION_ID, EXISTING_UUID, OWNER_UUID, NOW);
  return database;
}

function invite(roleLimit) {
  return {
    competitionId: COMPETITION_ID,
    submissionId: SUBMISSION_ID,
    configVersion: 1,
    playerUuid: INVITED_UUID,
    playerName: "Invitee",
    role: "MAIN",
    roleLimit,
    invitedByUuid: OWNER_UUID,
    actorSubject: "owner",
    invitedAt: NOW,
    auditEventId: "60000000-0000-4000-8000-000000000006"
  };
}

test("contributor insertion enforces the role limit in the write statement", async () => {
  const database = await seededDatabase();
  assert.equal(await inviteSubmissionContributor(d1(database), invite(1)), false);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM submission_participants WHERE submission_id = ?").get(SUBMISSION_ID).count,
    1
  );
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM competition_audit_events").get().count, 0);
  database.close();
});

test("contributor insertion succeeds below the role limit and records its audit", async () => {
  const database = await seededDatabase();
  assert.equal(await inviteSubmissionContributor(d1(database), invite(2)), true);
  const participant = database.prepare(`
    SELECT participant_role AS role, invite_status AS inviteStatus
    FROM submission_participants
    WHERE submission_id = ? AND player_uuid = ?
  `).get(SUBMISSION_ID, INVITED_UUID);
  assert.equal(participant.role, "MAIN");
  assert.equal(participant.inviteStatus, "PENDING");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM competition_audit_events").get().count, 1);
  database.close();
});

test("a lifecycle transition cannot race an invite or removal past the roster lock", async () => {
  const database = await seededDatabase();
  database.prepare("UPDATE competitions SET lifecycle_state = 'VOTING' WHERE id = ?").run(COMPETITION_ID);

  assert.equal(await inviteSubmissionContributor(d1(database), invite(2)), false);
  assert.equal(await removeSubmissionContributor(d1(database), {
    competitionId: COMPETITION_ID,
    submissionId: SUBMISSION_ID,
    configVersion: 1,
    playerUuid: EXISTING_UUID,
    actorSubject: "owner",
    removedByUuid: OWNER_UUID,
    removedAt: NOW,
    auditEventId: "70000000-0000-4000-8000-000000000007"
  }), false);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM submission_participants WHERE submission_id = ?").get(SUBMISSION_ID).count,
    1
  );
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM competition_audit_events").get().count, 0);
  database.close();
});

test("competition cancellation cannot race a pending invite response", async () => {
  const database = await seededDatabase();
  database.prepare("UPDATE competitions SET lifecycle_state = 'CANCELLED' WHERE id = ?").run(COMPETITION_ID);

  assert.equal(await respondSubmissionInvite(d1(database), {
    competitionId: COMPETITION_ID,
    submissionId: SUBMISSION_ID,
    playerUuid: EXISTING_UUID,
    actorSubject: "invitee",
    accept: true,
    respondedAt: NOW,
    auditEventId: "80000000-0000-4000-8000-000000000008"
  }), false);
  assert.equal(
    database.prepare(`
      SELECT invite_status AS inviteStatus
      FROM submission_participants
      WHERE submission_id = ? AND player_uuid = ?
    `).get(SUBMISSION_ID, EXISTING_UUID).inviteStatus,
    "PENDING"
  );
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM competition_audit_events").get().count, 0);
  database.close();
});
