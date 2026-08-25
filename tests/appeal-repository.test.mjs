import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  appealDetailsByIds,
  finalizeAppealSubmission,
  insertAppealAttachment,
  listOwnedAppeals,
  prepareAppealSubmission,
  recordAppealComment,
  recordAppealStatus
} from "../functions/lib/appeal-repository.js";
import { sanitizeAppealSubmission } from "../functions/lib/appeal-content.js";

const OWNER_ID = "123456789012345678";
const DRAFT_ID = "11111111-1111-4111-8111-111111111111";
const PLAYER_ID = "22222222-2222-4222-8222-222222222222";
const PUNISHMENT_ID = "33333333-3333-4333-8333-333333333333";
const ATTACHMENT_ID = "44444444-4444-4444-8444-444444444444";
const APPEAL_ID = "55555555-5555-4555-8555-555555555555";
const NOW = new Date("2026-08-25T12:00:00.000Z");

function d1(database) {
  function prepared(sql) {
    let params = [];
    return {
      bind(...values) { params = values; return this; },
      async all() { return { results: database.prepare(sql).all(...params) }; },
      async first() { return database.prepare(sql).get(...params) ?? null; },
      async run() {
        const result = database.prepare(sql).run(...params);
        return { meta: { changes: Number(result.changes ?? 0) } };
      },
      _sql: sql,
      _params() { return params; }
    };
  }
  return {
    prepare: prepared,
    async batch(statements) {
      database.exec("BEGIN");
      try {
        const result = statements.map((statement) => {
          const run = database.prepare(statement._sql).run(...statement._params());
          return { meta: { changes: Number(run.changes ?? 0) } };
        });
        database.exec("COMMIT");
        return result;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    }
  };
}

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  const directory = new URL("../migrations/", import.meta.url);
  const files = (await readdir(directory)).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort();
  for (const file of files) database.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  database.prepare(`
    INSERT INTO competition_discord_accounts (
      discord_user_id, username, global_name, avatar_hash, created_at, updated_at, guild_role_ids_json
    ) VALUES (?, 'P2wn', 'P2wn', NULL, ?, ?, '[]')
  `).run(OWNER_ID, NOW.toISOString(), NOW.toISOString());
  return database;
}

function answers() {
  return {
    whatHappened: "I continued an argument after staff asked the channel to move on. I sent several replies instead of leaving the conversation and the messages kept the argument active for everyone else.",
    whyReview: "I am asking staff to review the duration because the messages came from one short incident and I stopped after the final direction. I have included the complete log for context.",
    ruleUnderstanding: "The chat rule requires players to stop disruptive arguments and follow staff directions. Continuing after a warning is still disruptive even when I did not start the disagreement.",
    futureSteps: "I will stop replying when a conversation becomes heated, use the report command, and speak with staff privately. I will follow a direction to stop without sending another message.",
    additionalContext: "The attachment contains the full conversation in order."
  };
}

test("full appeal answers and evidence are bound to the Staff appeal ID", async () => {
  const database = await migratedDatabase();
  const db = d1(database);
  await insertAppealAttachment(db, {
    id: ATTACHMENT_ID,
    draftId: DRAFT_ID,
    ownerDiscordId: OWNER_ID,
    storageKey: `appeals/${DRAFT_ID}/${ATTACHMENT_ID}.txt`,
    displayName: "chat.log",
    mimeType: "text/plain",
    byteSize: 120,
    sha256: "a".repeat(64),
    width: null,
    height: null,
    createdAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 86_400_000).toISOString()
  });
  const submission = sanitizeAppealSubmission({
    draftId: DRAFT_ID,
    minecraftUuid: PLAYER_ID,
    punishmentId: PUNISHMENT_ID,
    attachmentIds: [ATTACHMENT_ID],
    ...answers()
  });
  const session = { discord: { id: OWNER_ID } };
  const account = { uuid: PLAYER_ID, name: "P2wn" };
  const payloadHash = "b".repeat(64);
  assert.deepEqual(
    await prepareAppealSubmission(db, { session, account, submission, payloadHash, now: NOW }),
    { status: "PREPARING", appealId: null }
  );
  await finalizeAppealSubmission(db, {
    ownerDiscordId: OWNER_ID,
    draftId: DRAFT_ID,
    payloadHash,
    appealId: APPEAL_ID,
    attachmentIds: [ATTACHMENT_ID],
    now: NOW
  });

  const details = await appealDetailsByIds(db, [APPEAL_ID]);
  assert.deepEqual(details.get(APPEAL_ID).answers, answers());
  assert.equal(details.get(APPEAL_ID).attachments[0].name, "chat.log");
  assert.equal(details.get(APPEAL_ID).attachments[0].previewUrl, `/api/reviewer/appeals/attachments/${ATTACHMENT_ID}`);
  assert.throws(
    () => database.prepare("UPDATE appeal_attachments SET appeal_id = ? WHERE id = ?").run(PUNISHMENT_ID, ATTACHMENT_ID),
    /appeal_attachment_binding_immutable/
  );
  database.close();
});

test("an appeal draft cannot be reused with a different payload", async () => {
  const database = await migratedDatabase();
  const db = d1(database);
  const session = { discord: { id: OWNER_ID } };
  const account = { uuid: PLAYER_ID, name: "P2wn" };
  const submission = sanitizeAppealSubmission({
    draftId: DRAFT_ID,
    minecraftUuid: PLAYER_ID,
    punishmentId: PUNISHMENT_ID,
    attachmentIds: [],
    ...answers()
  });
  await prepareAppealSubmission(db, { session, account, submission, payloadHash: "c".repeat(64), now: NOW });
  assert.deepEqual(
    await prepareAppealSubmission(db, { session, account, submission, payloadHash: "d".repeat(64), now: NOW }),
    { status: "CONFLICT" }
  );
  database.close();
});

test("players can read status and ordered appeal messages without seeing another account", async () => {
  const database = await migratedDatabase();
  const db = d1(database);
  const submission = sanitizeAppealSubmission({
    draftId: DRAFT_ID,
    minecraftUuid: PLAYER_ID,
    punishmentId: PUNISHMENT_ID,
    attachmentIds: [],
    ...answers()
  });
  const session = { discord: { id: OWNER_ID } };
  const account = { uuid: PLAYER_ID, name: "P2wn" };
  const payloadHash = "e".repeat(64);
  await prepareAppealSubmission(db, { session, account, submission, payloadHash, now: NOW });
  await finalizeAppealSubmission(db, {
    ownerDiscordId: OWNER_ID,
    draftId: DRAFT_ID,
    payloadHash,
    appealId: APPEAL_ID,
    caseId: "E-1042",
    punishmentType: "MUTE",
    currentStatus: "OPEN",
    currentVersion: 1,
    attachmentIds: [],
    now: NOW
  });

  const staffComment = {
    id: "66666666-6666-4666-8666-666666666666",
    appealId: APPEAL_ID,
    authorType: "STAFF",
    authorId: "77777777-7777-4777-8777-777777777777",
    authorName: "Moderator",
    body: "Please explain which message you believe was taken out of context.",
    idempotencyKey: "comment-staff-1",
    createdAt: "2026-08-25T12:05:00.000Z"
  };
  assert.equal((await recordAppealComment(db, staffComment)).status, "CREATED");
  assert.equal((await recordAppealComment(db, staffComment)).status, "REPLAYED");
  assert.equal((await recordAppealComment(db, { ...staffComment, body: "Different message" })).status, "CONFLICT");
  assert.equal(await recordAppealStatus(db, {
    appealId: APPEAL_ID,
    status: "INFORMATION_REQUESTED",
    version: 2,
    updatedAt: "2026-08-25T12:05:00.000Z"
  }), true);
  await recordAppealComment(db, {
    id: "88888888-8888-4888-8888-888888888888",
    appealId: APPEAL_ID,
    authorType: "PLAYER",
    authorId: OWNER_ID,
    authorName: "P2wn",
    body: "It was the second message in the attached conversation.",
    idempotencyKey: "comment-player-1",
    createdAt: "2026-08-25T12:10:00.000Z"
  });

  const appeals = await listOwnedAppeals(db, OWNER_ID);
  assert.equal(appeals.length, 1);
  assert.equal(appeals[0].caseId, "E-1042");
  assert.equal(appeals[0].punishmentType, "MUTE");
  assert.equal(appeals[0].status, "INFORMATION_REQUESTED");
  assert.equal(appeals[0].version, 2);
  assert.equal(appeals[0].comments.length, 2);
  assert.equal(appeals[0].comments[0].authorType, "STAFF");
  assert.equal(appeals[0].comments[1].authorType, "PLAYER");
  assert.deepEqual(await listOwnedAppeals(db, "999999999999999999"), []);
  database.close();
});
