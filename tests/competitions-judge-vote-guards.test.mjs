import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  const directory = new URL("../migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
    database.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  }
  return database;
}

function seedCompetition(database, state = "VOTING") {
  database.prepare(`
    INSERT INTO competitions (
      id, slug, title, category, lifecycle_state, current_config_version,
      created_by_subject, created_by_uuid, created_at, updated_at
    ) VALUES ('competition-1', 'fairness', 'Fairness', 'Build', ?, 1, 'subject', ?, ?, ?)
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
    ) VALUES ('competition-1', 1, ?, 'subject', ?, ?, 'Initial')
  `).run(
    JSON.stringify({ voting: { votesPerVoter: 2 } }),
    "00000000-0000-0000-0000-000000000001",
    "2026-08-23T00:00:00.000Z"
  );
}

function seedSubmission(database, id, ownerUuid, status = "APPROVED") {
  database.prepare(`
    INSERT INTO submissions (
      id, competition_id, entry_type, status, owner_subject, owner_uuid,
      owner_name, title, description, revision, staff_edited,
      created_at, updated_at, submitted_at, approved_at
    ) VALUES (?, 'competition-1', 'GROUP', ?, ?, ?, 'Owner', ?, 'Description', 1, 0, ?, ?, ?, ?)
  `).run(
    id,
    status,
    `subject-${ownerUuid}`,
    ownerUuid,
    `Entry ${id}`,
    "2026-08-23T00:01:00.000Z",
    "2026-08-23T00:02:00.000Z",
    "2026-08-23T00:02:00.000Z",
    status === "APPROVED" ? "2026-08-23T00:03:00.000Z" : null
  );
}

function assignJudge(database, judgeUuid = "judge-1") {
  database.prepare(`
    INSERT INTO competition_judges (
      competition_id, judge_uuid, judge_name, assigned_by_uuid, assigned_at
    ) VALUES ('competition-1', ?, 'Judge', ?, ?)
  `).run(
    judgeUuid,
    "00000000-0000-0000-0000-000000000001",
    "2026-08-23T00:04:00.000Z"
  );
}

test("assigned judge cannot later own an entry but may be an accepted helper", async () => {
  const database = await migratedDatabase();
  seedCompetition(database, "SUBMISSIONS_OPEN");
  assignJudge(database);

  assert.throws(() => seedSubmission(database, "judge-entry", "judge-1", "DRAFT"), /judge_cannot_enter/);

  seedSubmission(database, "entry-1", "owner-1", "DRAFT");
  database.prepare(`
    INSERT INTO submission_participants (
      submission_id, player_uuid, player_name, participant_role,
      invite_status, invited_by_uuid, invited_at, responded_at
    ) VALUES ('entry-1', 'judge-1', 'Judge', 'HELPER', 'ACCEPTED', 'owner-1', ?, ?)
  `).run("2026-08-23T00:05:00.000Z", "2026-08-23T00:06:00.000Z");

  assert.throws(() => database.prepare(`
    UPDATE submission_participants
    SET participant_role = 'MAIN'
    WHERE submission_id = 'entry-1' AND player_uuid = 'judge-1'
  `).run(), /judge_cannot_enter/);

  database.close();
});

test("judge scores require an active assignment, JUDGING state, current config, and approved entry", async () => {
  const database = await migratedDatabase();
  seedCompetition(database, "JUDGING");
  seedSubmission(database, "entry-1", "owner-1");
  assignJudge(database);

  database.prepare(`
    INSERT INTO judge_scores (
      competition_id, submission_id, judge_uuid, config_version,
      criteria_json, bonus_points, computed_score,
      submitted_at, updated_at
    ) VALUES ('competition-1', 'entry-1', 'judge-1', 1, '{}', 0, 9, ?, ?)
  `).run("2026-08-23T00:10:00.000Z", "2026-08-23T00:10:00.000Z");

  assert.throws(() => database.prepare(`
    INSERT INTO judge_scores (
      competition_id, submission_id, judge_uuid, config_version,
      criteria_json, bonus_points, computed_score,
      submitted_at, updated_at
    ) VALUES ('competition-1', 'entry-1', 'not-a-judge', 1, '{}', 0, 9, ?, ?)
  `).run("2026-08-23T00:10:00.000Z", "2026-08-23T00:10:00.000Z"), /judge_score_not_allowed/);

  database.close();
});

test("judges, owners, and main participants cannot vote for prohibited entries while helpers can", async () => {
  const database = await migratedDatabase();
  seedCompetition(database, "VOTING");
  seedSubmission(database, "entry-1", "owner-1");
  seedSubmission(database, "entry-2", "owner-2");
  assignJudge(database, "judge-1");

  database.prepare(`
    INSERT INTO submission_participants (
      submission_id, player_uuid, player_name, participant_role,
      invite_status, invited_by_uuid, invited_at, responded_at
    ) VALUES ('entry-1', 'main-1', 'Main', 'MAIN', 'ACCEPTED', 'owner-1', ?, ?)
  `).run("2026-08-23T00:05:00.000Z", "2026-08-23T00:06:00.000Z");
  database.prepare(`
    INSERT INTO submission_participants (
      submission_id, player_uuid, player_name, participant_role,
      invite_status, invited_by_uuid, invited_at, responded_at
    ) VALUES ('entry-1', 'helper-1', 'Helper', 'HELPER', 'ACCEPTED', 'owner-1', ?, ?)
  `).run("2026-08-23T00:05:00.000Z", "2026-08-23T00:06:00.000Z");

  const vote = (subject, uuid, submissionId) => database.prepare(`
    INSERT INTO votes (
      competition_id, voter_subject, voter_uuid, submission_id, created_at, updated_at
    ) VALUES ('competition-1', ?, ?, ?, ?, ?)
  `).run(subject, uuid, submissionId, "2026-08-23T00:20:00.000Z", "2026-08-23T00:20:00.000Z");

  assert.throws(() => vote("subject-judge", "judge-1", "entry-2"), /judge_cannot_vote/);
  assert.throws(() => vote("subject-owner", "owner-1", "entry-1"), /owner_cannot_vote_own_entry/);
  assert.throws(() => vote("subject-main", "main-1", "entry-1"), /participant_cannot_vote_own_entry/);
  vote("subject-helper", "helper-1", "entry-1");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM votes").get().count, 1);
  database.close();
});

test("all linked Minecraft accounts share the configured voter-subject ballot limit", async () => {
  const database = await migratedDatabase();
  seedCompetition(database, "VOTING");
  seedSubmission(database, "entry-1", "owner-1");
  seedSubmission(database, "entry-2", "owner-2");
  seedSubmission(database, "entry-3", "owner-3");

  const vote = (uuid, submissionId) => database.prepare(`
    INSERT INTO votes (
      competition_id, voter_subject, voter_uuid, submission_id, created_at, updated_at
    ) VALUES ('competition-1', 'same-discord-subject', ?, ?, ?, ?)
  `).run(uuid, submissionId, "2026-08-23T00:20:00.000Z", "2026-08-23T00:20:00.000Z");

  vote("minecraft-account-1", "entry-1");
  vote("minecraft-account-2", "entry-2");
  assert.throws(() => vote("minecraft-account-3", "entry-3"), /vote_limit_reached/);
  database.close();
});
