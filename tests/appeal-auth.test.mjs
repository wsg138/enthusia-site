import assert from "node:assert/strict";
import test from "node:test";
import { buildSession, canReview } from "../functions/lib/auth.js";
import {
  appealSubmissionHash,
  buildStaffReason,
  plainAppealText,
  sanitizeAppealSubmission,
  staffAppealIdempotencyKey
} from "../functions/lib/appeal-content.js";
import { sanitizeAppealCandidate } from "../functions/lib/appeal-eligibility.js";
import { buildAppealPayload } from "../functions/api/appeals.js";
import { linkedMinecraftAccount } from "../functions/lib/appeal-session.js";
import { sanitizeDecision } from "../functions/api/reviewer/appeals/[id].js";
import { boundedIdempotencyKey, requireSameOrigin } from "../functions/lib/security.js";
import { publicStaffRoute, reviewerRank, signedStaffRequest, staffRoute } from "../functions/lib/staff-api.js";
import { isCanonicalUuid } from "../functions/lib/validation.js";

const DRAFT_ID = "123e4567-e89b-42d3-a456-426614174010";
const PLAYER_ID = "123e4567-e89b-42d3-a456-426614174000";
const PUNISHMENT_ID = "123e4567-e89b-42d3-a456-426614174099";
const ATTACHMENT_ID = "123e4567-e89b-42d3-a456-426614174011";

const playerClaims = {
  sub: "access-user-1",
  custom: {
    minecraft_uuid: PLAYER_ID,
    minecraft_name: "Lincoln",
    roles: ["player"]
  }
};

const appealAnswers = {
  whatHappened: "I joined the conversation after it had already become heated and continued arguing instead of stepping away when staff told everyone to stop. I replied several more times before leaving chat.",
  whyReview: "I understand why staff acted, but I would like the duration reviewed because I stopped after the final warning and have no recent history of the same behavior. The messages all came from one short argument.",
  ruleUnderstanding: "The chat rule requires players to stop disruptive arguments and follow staff directions. Continuing after a warning keeps the disruption going even when the original disagreement involved someone else.",
  futureSteps: "I will leave heated conversations, use the report tools, and contact staff privately instead of continuing an argument in public chat. If staff asks me to stop, I will stop immediately.",
  additionalContext: "The relevant messages were all sent within the same short conversation. I attached the complete log rather than selected lines."
};

function appealInput(overrides = {}) {
  return {
    draftId: DRAFT_ID,
    minecraftUuid: PLAYER_ID,
    punishmentId: PUNISHMENT_ID,
    attachmentIds: [ATTACHMENT_ID],
    ...appealAnswers,
    ...overrides
  };
}

test("buildSession requires a linked canonical player", () => {
  assert.throws(() => buildSession({ sub: "user-1", email: "player@example.com" }), /not linked/);
});

test("buildSession accepts canonical Floodgate identity claims", () => {
  const session = buildSession({
    sub: "bedrock-access-user",
    custom: {
      minecraft_uuid: "00000000-0000-0000-0009-01f64f65c7c3",
      minecraft_name: "BedrockPlayer",
      roles: ["player"]
    }
  });
  assert.equal(session.player.uuid, "00000000-0000-0000-0009-01f64f65c7c3");
});

test("linked Minecraft identity is resolved from the signed-in session", () => {
  const session = { linkedMinecraftAccounts: [{ uuid: PLAYER_ID, name: "Lincoln" }] };
  assert.deepEqual(linkedMinecraftAccount(session, PLAYER_ID), { uuid: PLAYER_ID, name: "Lincoln" });
  assert.equal(linkedMinecraftAccount(session, PUNISHMENT_ID), null);
});

test("appeal answers support bounded formatting without counting markup as content", () => {
  assert.equal(plainAppealText("## **Important**\n- first point"), "Important first point");
  const submission = sanitizeAppealSubmission(appealInput({
    whatHappened: `## What happened\n\n**${appealAnswers.whatHappened}**`
  }));
  assert.ok(submission);
  assert.ok(submission.staffReason.length <= 1000);
  assert.match(submission.staffReason, /^What happened\n/);
  assert.equal(sanitizeAppealSubmission(appealInput({ whatHappened: "**x**" })), null);
});

test("browser identity fields cannot override linked appeal identity", () => {
  const submission = sanitizeAppealSubmission(appealInput());
  const payloadHash = "a".repeat(64);
  assert.deepEqual(buildAppealPayload(submission, { uuid: PLAYER_ID, name: "Lincoln" }, payloadHash), {
    punishmentId: PUNISHMENT_ID,
    reason: buildStaffReason(appealAnswers),
    accountId: PLAYER_ID,
    username: "Lincoln",
    idempotencyKey: staffAppealIdempotencyKey(payloadHash)
  });
});

test("submission hashes bind answers, evidence, account, and punishment", async () => {
  const session = { discord: { id: "123456789012345678" } };
  const one = sanitizeAppealSubmission(appealInput());
  const two = sanitizeAppealSubmission(appealInput({ attachmentIds: [] }));
  const oneHash = await appealSubmissionHash(session, one);
  assert.match(oneHash, /^[0-9a-f]{64}$/);
  assert.notEqual(oneHash, await appealSubmissionHash(session, two));
});

test("appeal candidates are reduced to the private picker contract", () => {
  assert.deepEqual(sanitizeAppealCandidate({
    id: PUNISHMENT_ID,
    caseId: "CASE-101",
    type: "BAN",
    reason: "Griefing",
    createdAt: "2026-08-24T12:00:00Z",
    internalNote: "hidden"
  }), {
    id: PUNISHMENT_ID,
    caseId: "CASE-101",
    type: "BAN",
    reason: "Griefing",
    createdAt: "2026-08-24T12:00:00Z"
  });
  assert.equal(sanitizeAppealCandidate({ id: "bad" }), null);
});

test("review access requires an explicitly configured privileged role", () => {
  const player = buildSession(playerClaims);
  const moderator = buildSession({
    sub: "m",
    custom: { minecraft_uuid: "123e4567-e89b-42d3-a456-426614174001", minecraft_name: "Mod", roles: ["moderator"] }
  });
  const env = { APPEAL_REVIEWER_ROLES: "admin,moderator" };
  assert.equal(canReview(player, env), false);
  assert.equal(canReview(moderator, env), true);
  assert.equal(reviewerRank(moderator), "MOD");
});

test("mutation requests require the exact site origin", () => {
  assert.equal(requireSameOrigin(new Request("https://enthusia.example/api/appeals", {
    headers: { origin: "https://enthusia.example" }
  })), true);
  assert.equal(requireSameOrigin(new Request("https://enthusia.example/api/appeals", {
    headers: { origin: "https://evil.example" }
  })), false);
});

test("review decisions require version, bounded note, and replay key", () => {
  assert.deepEqual(sanitizeDecision({
    decision: "approve",
    expectedVersion: 2,
    note: "Approved after review",
    idempotencyKey: "decision-123"
  }), {
    decision: "approve",
    expectedVersion: 2,
    note: "Approved after review",
    idempotencyKey: "decision-123"
  });
  assert.equal(sanitizeDecision({
    decision: "approve",
    expectedVersion: 0,
    note: "Approved",
    idempotencyKey: "decision-123"
  }), null);
  assert.equal(boundedIdempotencyKey("short"), null);
});

test("invalid, duplicate, and oversized submissions are rejected", () => {
  assert.ok(sanitizeAppealSubmission(appealInput()));
  assert.equal(sanitizeAppealSubmission(appealInput({ whyReview: "x".repeat(3001) })), null);
  assert.equal(sanitizeAppealSubmission(appealInput({ futureSteps: " ".repeat(200) })), null);
  assert.equal(sanitizeAppealSubmission(appealInput({ attachmentIds: Array(6).fill(ATTACHMENT_ID) })), null);
  assert.equal(sanitizeAppealSubmission(appealInput({ attachmentIds: [ATTACHMENT_ID, ATTACHMENT_ID] })), null);
});

test("strict UUID validation supports Java and Floodgate identities", () => {
  assert.equal(isCanonicalUuid(PUNISHMENT_ID), true);
  assert.equal(isCanonicalUuid("00000000-0000-0000-0009-01f64f65c7c3"), true);
  assert.equal(isCanonicalUuid("zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz"), false);
});

test("private Staff API requests carry a valid replay-protected signature", async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options };
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const env = { STAFF_API_BEARER_TOKEN: "b".repeat(32), STAFF_API_HMAC_SECRET: "s".repeat(32) };
    await signedStaffRequest(env, "/v1/website/appeals/eligible", { accountId: PLAYER_ID });
    assert.equal(captured.url, "https://staff-api.enthusia.info/v1/website/appeals/eligible");
    assert.equal(captured.options.method, "POST");
    assert.equal(captured.options.headers.authorization, `Bearer ${"b".repeat(32)}`);
    assert.match(captured.options.headers["x-enthusia-nonce"], /^[0-9a-f-]{36}$/);
    assert.match(captured.options.headers["x-enthusia-signature"], /^[A-Za-z0-9_-]{43}$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("private Staff API rejects routes outside the appeal allowlist", () => {
  assert.throws(() => staffRoute("/v1/public/punishments"), /Invalid Staff API route/);
  assert.equal(staffRoute("/v1/website/appeals/eligible"), "/v1/website/appeals/eligible");
  assert.equal(publicStaffRoute("/v1/public/punishments"), "/v1/public/punishments");
  assert.throws(() => publicStaffRoute("/v1/website/appeals/eligible"), /Invalid public Staff API route/);
});
