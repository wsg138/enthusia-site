import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { commentAllowed } from "../functions/api/appeals/[id]/comments.js";
import {
  projectAppealMutation,
  sanitizeAppealEdit,
  sanitizeReviewerClaim,
  sanitizeReviewerReopen
} from "../functions/lib/appeal-lifecycle.js";
import {
  appealLifecycleByIds,
  findOwnedAppealLifecycle,
  recordAppealEditMirror,
  recordAppealLifecycleMirror
} from "../functions/lib/appeal-lifecycle-repository.js";

const APPEAL_ID = "123e4567-e89b-42d3-a456-426614174010";
const PUNISHMENT_ID = "123e4567-e89b-42d3-a456-426614174099";
const VALID_ANSWERS = Object.freeze({
  whatHappened: "I am explaining what happened in enough detail to satisfy the appeal form. ".repeat(3),
  whyReview: "I want the punishment reviewed because the evidence and context should be checked carefully. ".repeat(2),
  ruleUnderstanding: "I understand the rule involved and why the server enforces it for players. ".repeat(2),
  futureSteps: "I will follow the rule and change how I handle the same situation in the future. ".repeat(2),
  additionalContext: ""
});

function database(row = null) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          calls.push({ sql, values });
          return {
            async first() { return row; },
            async all() { return { results: row ? [row] : [] }; },
            async run() { return { meta: { changes: 1 } }; }
          };
        }
      };
    }
  };
}

test("player appeal edits use an explicit browser request allowlist", () => {
  const clean = sanitizeAppealEdit({
    expectedVersion: 2,
    idempotencyKey: "appeal-edit-1234",
    answers: VALID_ANSWERS
  });
  assert.equal(clean.expectedVersion, 2);
  assert.match(clean.staffReason, /What happened/);
  assert.equal(sanitizeAppealEdit({
    expectedVersion: 2,
    idempotencyKey: "appeal-edit-1234",
    answers: VALID_ANSWERS,
    accountId: "client-cannot-set-this"
  }), null);
});

test("reviewer lifecycle inputs cannot override staff identity or claim state", () => {
  assert.deepEqual(
    sanitizeReviewerClaim({ expectedVersion: 4, idempotencyKey: "claim-key-1234" }),
    { expectedVersion: 4, idempotencyKey: "claim-key-1234" }
  );
  assert.equal(sanitizeReviewerClaim({
    expectedVersion: 4,
    idempotencyKey: "claim-key-1234",
    actorRank: "FOUNDER"
  }), null);
  assert.deepEqual(
    sanitizeReviewerReopen({
      expectedVersion: 5,
      idempotencyKey: "reopen-key-1234",
      note: "New information warrants another review."
    }),
    {
      expectedVersion: 5,
      idempotencyKey: "reopen-key-1234",
      note: "New information warrants another review."
    }
  );
});

test("Staff lifecycle responses are projected through a private allowlist", () => {
  const projected = projectAppealMutation({
    id: APPEAL_ID,
    punishmentId: PUNISHMENT_ID,
    caseId: "01ARZ3NDEKTSV4RR",
    punishmentType: "BAN",
    player: "Lincoln",
    reason: "A bounded reason",
    status: "OPEN",
    version: 3,
    decision: null,
    decisionNote: null,
    createdAt: "2026-09-28T00:00:00Z",
    updatedAt: "2026-09-28T01:00:00Z",
    replayed: false,
    claimed: true,
    internalAccountToken: "must-not-leak",
    staffNotes: "must-not-leak"
  }, APPEAL_ID);
  assert.equal(projected.claimed, true);
  assert.equal("internalAccountToken" in projected, false);
  assert.equal("staffNotes" in projected, false);
});

test("claimed OPEN appeals are read-only unless Staff explicitly requests information", () => {
  assert.equal(commentAllowed({ status: "OPEN", claimed: false }), true);
  assert.equal(commentAllowed({ status: "OPEN", claimed: true }), false);
  assert.equal(commentAllowed({ status: "INFORMATION_REQUESTED", claimed: true }), true);
  assert.equal(commentAllowed({ status: "DENIED", claimed: false }), false);
});

test("lifecycle repository scopes ownership and persists edit/claim mirrors", async () => {
  const row = {
    id: APPEAL_ID,
    status: "OPEN",
    version: 2,
    claimed: 0,
    answersJson: "{}",
    staffReason: "reason"
  };
  const db = database(row);
  const owned = await findOwnedAppealLifecycle(db, "discord-owner", APPEAL_ID);
  assert.equal(owned.claimed, false);
  assert.deepEqual(db.calls[0].values, ["discord-owner", APPEAL_ID]);

  await recordAppealEditMirror(db, {
    ownerDiscordId: "discord-owner",
    appealId: APPEAL_ID,
    answers: VALID_ANSWERS,
    staffReason: "updated reason",
    version: 3,
    updatedAt: "2026-09-28T02:00:00Z"
  });
  assert.match(db.calls[1].sql, /current_claimed = 0/);
  assert.equal(db.calls[1].values.at(-2), APPEAL_ID);

  await recordAppealLifecycleMirror(db, {
    appealId: APPEAL_ID,
    status: "OPEN",
    version: 4,
    claimed: true,
    updatedAt: "2026-09-28T03:00:00Z"
  });
  assert.equal(db.calls[2].values[2], 1);
});

test("lifecycle collection returns only requested safe mirror fields", async () => {
  const db = database({
    id: APPEAL_ID,
    status: "OPEN",
    version: 8,
    claimed: 1,
    answersJson: "{}",
    staffReason: "reason"
  });
  const entries = await appealLifecycleByIds(db, [APPEAL_ID, APPEAL_ID]);
  assert.equal(entries.size, 1);
  assert.equal(entries.get(APPEAL_ID).claimed, true);
});

test("migration 0033 keeps appeal identity immutable while enabling controlled text edits", () => {
  const migration = fs.readFileSync(
    new URL("../migrations/0033_appeal_claim_lifecycle.sql", import.meta.url),
    "utf8"
  );
  assert.match(migration, /ADD COLUMN current_claimed/);
  assert.match(migration, /appeal_submission_identity_immutable/);
  assert.match(migration, /OLD\.payload_hash <> NEW\.payload_hash/);
  const immutableTrigger = migration.split("CREATE TRIGGER appeal_submission_identity_immutable")[1];
  assert.doesNotMatch(immutableTrigger, /OLD\.answers_json <> NEW\.answers_json/);
  assert.doesNotMatch(immutableTrigger, /OLD\.staff_reason <> NEW\.staff_reason/);
});
