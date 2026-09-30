import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const UUID_A = "00000000-0000-4000-8000-0000000000a1";
const UUID_B = "00000000-0000-4000-8000-0000000000b2";
const UUID_C = "00000000-0000-4000-8000-0000000000c3";
const UUID_D = "00000000-0000-4000-8000-0000000000d4";
const DISCORD_A = "1".repeat(18);
const DISCORD_B = "1".repeat(17) + "2";
const DISCORD_C = "1".repeat(17) + "3";
const DISCORD_D = "1".repeat(17) + "4";
const DISCORD_E = "1".repeat(17) + "5";
const DISCORD_F = "1".repeat(17) + "6";
const DISCORD_SUBJECT_A = `discord:${DISCORD_A}`;
const DISCORD_SUBJECT_B = `discord:${DISCORD_B}`;
const DISCORD_SUBJECT_C = `discord:${DISCORD_C}`;
const DISCORD_SUBJECT_D = `discord:${DISCORD_D}`;
const DISCORD_SUBJECT_E = `discord:${DISCORD_E}`;
const DISCORD_SUBJECT_F = `discord:${DISCORD_F}`;

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  const directory = new URL("../migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
    database.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  }
  return database;
}

function seedCompetition(database, state = "VOTING") {
  const now = "2026-08-23T02:40:00.000Z";
  database.prepare(`
    INSERT INTO competitions (
      id, slug, title, category, lifecycle_state, current_config_version,
      created_by_subject, created_by_uuid, created_at, updated_at
    ) VALUES ('competition-1', 'linked-fairness', 'Linked Fairness', 'Build', ?, 1, 'staff', ?, ?, ?)
  `).run(state, UUID_D, now, now);
  database.prepare(`
    INSERT INTO competition_config_versions (
      competition_id, version, config_json, created_by_subject,
      created_by_uuid, created_at, change_note
    ) VALUES ('competition-1', 1, ?, 'staff', ?, ?, 'Initial')
  `).run(JSON.stringify({ voting: { votesPerVoter: 3 } }), UUID_D, now);
}

function seedDiscordIdentity(database, discordId, accounts) {
  const now = "2026-08-23T02:40:00.000Z";
  database.prepare(`
    INSERT INTO competition_discord_accounts (
      discord_user_id, username, created_at, updated_at
    ) VALUES (?, ?, ?, ?)
  `).run(discordId, `user-${discordId}`, now, now);
  for (const [uuid, name] of accounts) {
    database.prepare(`
      INSERT INTO competition_minecraft_links (
        minecraft_uuid, discord_user_id, minecraft_name, linked_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(uuid, discordId, name, now, now);
  }
}

function seedSubmission(database, id, ownerUuid, ownerSubject = "owner-subject") {
  const now = "2026-08-23T02:41:00.000Z";
  database.prepare(`
    INSERT INTO submissions (
      id, competition_id, entry_type, status, owner_subject, owner_uuid,
      owner_name, title, description, revision, staff_edited,
      created_at, updated_at, submitted_at, approved_at
    ) VALUES (?, 'competition-1', 'GROUP', 'APPROVED', ?, ?, 'Owner', ?, 'Description', 1, 0, ?, ?, ?, ?)
  `).run(id, ownerSubject, ownerUuid, `Entry ${id}`, now, now, now, now);
}

function vote(database, subject, voterUuid, submissionId) {
  const now = "2026-08-23T02:45:00.000Z";
  return database.prepare(`
    INSERT INTO votes (
      competition_id, voter_subject, voter_uuid, submission_id, created_at, updated_at
    ) VALUES ('competition-1', ?, ?, ?, ?, ?)
  `).run(subject, voterUuid, submissionId, now, now);
}

function assignJudge(database, judgeUuid) {
  return database.prepare(`
    INSERT INTO competition_judges (
      competition_id, judge_uuid, judge_name, assigned_by_uuid, assigned_at
    ) VALUES ('competition-1', ?, 'Judge', ?, ?)
  `).run(judgeUuid, UUID_D, "2026-08-23T02:46:00.000Z");
}

test("a Discord-linked alt cannot vote for an entry owned by a sibling Minecraft account", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  seedDiscordIdentity(database, DISCORD_A, [[UUID_A, "Alpha"], [UUID_B, "Beta"]]);
  seedSubmission(database, "entry-1", UUID_A, DISCORD_SUBJECT_A);
  seedSubmission(database, "entry-2", UUID_C, "other");

  assert.throws(
    () => vote(database, DISCORD_SUBJECT_A, UUID_B, "entry-1"),
    /linked_owner_cannot_vote_own_entry/
  );
  vote(database, DISCORD_SUBJECT_A, UUID_B, "entry-2");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM votes").get().count, 1);
  database.close();
});

test("a Discord-linked alt cannot vote when a sibling Minecraft account is a judge", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  seedDiscordIdentity(database, DISCORD_B, [[UUID_A, "Alpha"], [UUID_B, "Beta"]]);
  seedSubmission(database, "entry-1", UUID_C, "other");
  assignJudge(database, UUID_A);

  assert.throws(
    () => vote(database, DISCORD_SUBJECT_B, UUID_B, "entry-1"),
    /linked_judge_cannot_vote/
  );
  database.close();
});

test("judge assignment is rejected when a linked sibling owns an entry or already voted", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  seedDiscordIdentity(database, DISCORD_C, [[UUID_A, "Alpha"], [UUID_B, "Beta"]]);
  seedSubmission(database, "entry-1", UUID_A, DISCORD_SUBJECT_C);
  assert.throws(() => assignJudge(database, UUID_B), /linked_judge_is_submission_owner/);
  database.close();

  const voted = await migratedDatabase();
  seedCompetition(voted);
  seedDiscordIdentity(voted, DISCORD_D, [[UUID_A, "Alpha"], [UUID_B, "Beta"]]);
  seedSubmission(voted, "entry-1", UUID_C, "other");
  vote(voted, DISCORD_SUBJECT_D, UUID_A, "entry-1");
  assert.throws(() => assignJudge(voted, UUID_B), /linked_judge_has_voted/);
  voted.close();
});

test("a linked sibling cannot become an owner or main participant after judge assignment", async () => {
  const database = await migratedDatabase();
  seedCompetition(database, "SUBMISSIONS_OPEN");
  seedDiscordIdentity(database, DISCORD_E, [[UUID_A, "Alpha"], [UUID_B, "Beta"]]);
  assignJudge(database, UUID_A);

  assert.throws(
    () => seedSubmission(database, "entry-owner", UUID_B, DISCORD_SUBJECT_E),
    /linked_judge_cannot_enter/
  );

  seedSubmission(database, "entry-other", UUID_C, "other");
  database.prepare("UPDATE submissions SET status = 'DRAFT' WHERE id = 'entry-other'").run();
  assert.throws(() => database.prepare(`
    INSERT INTO submission_participants (
      submission_id, player_uuid, player_name, participant_role,
      invite_status, invited_by_uuid, invited_at, responded_at
    ) VALUES ('entry-other', ?, 'Beta', 'MAIN', 'ACCEPTED', ?, ?, ?)
  `).run(UUID_B, UUID_C, "2026-08-23T02:47:00.000Z", "2026-08-23T02:47:00.000Z"), /linked_judge_cannot_enter/);

  database.close();
});

test("Discord voter UUID must belong to the stated Discord account", async () => {
  const database = await migratedDatabase();
  seedCompetition(database);
  seedDiscordIdentity(database, DISCORD_F, [[UUID_A, "Alpha"]]);
  seedSubmission(database, "entry-1", UUID_C, "other");
  assert.throws(
    () => vote(database, DISCORD_SUBJECT_F, UUID_B, "entry-1"),
    /vote_identity_mismatch/
  );
  database.close();
});
