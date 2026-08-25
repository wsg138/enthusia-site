import assert from "node:assert/strict";
import test from "node:test";
import { buildSession, canReview } from "../functions/lib/auth.js";
import { buildAppealPayload, buildReason, sanitizeSubmission } from "../functions/api/appeals.js";
import { sanitizeClaim } from "../functions/lib/appeal-claim.js";
import { discordAppealAccountId } from "../functions/lib/appeal-session.js";
import { sanitizeDecision } from "../functions/api/reviewer/appeals/[id].js";
import { boundedIdempotencyKey, requireSameOrigin } from "../functions/lib/security.js";
import { publicStaffRoute, reviewerRank, signedStaffRequest, staffRoute } from "../functions/lib/staff-api.js";
import { isCanonicalUuid } from "../functions/lib/validation.js";

const playerClaims = {
  sub: "access-user-1",
  custom: {
    minecraft_uuid: "123e4567-e89b-12d3-a456-426614174000",
    minecraft_name: "Lincoln",
    roles: ["player"]
  }
};

const appealAnswers = {
  whatHappened: "I joined the conversation after it had already become heated and continued arguing instead of stepping away when staff told everyone to stop.",
  whyReview: "I understand why staff acted, but I would like the duration reviewed because I stopped after the final warning and have no recent history of the same behavior.",
  futureSteps: "I will leave heated conversations, use the report tools, and contact staff privately instead of continuing an argument in public chat.",
  additionalContext: "The relevant messages were all sent within the same short conversation."
};

test("buildSession requires a linked canonical player", () => {
  assert.throws(() => buildSession({ sub: "user-1", email: "player@example.com" }), /not linked/);
});

test("Discord appeal accounts are stable and do not require a Minecraft link", async () => {
  const accountId = await discordAppealAccountId("discord:123456789012345678");
  assert.match(accountId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(await discordAppealAccountId("discord:123456789012345678"), accountId);
  assert.notEqual(await discordAppealAccountId("discord:123456789012345679"), accountId);
  await assert.rejects(() => discordAppealAccountId("discord:short"), /invalid/);
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
  assert.throws(() => buildSession({
    sub: "malformed-access-user",
    custom: {
      minecraft_uuid: "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz",
      minecraft_name: "BadClaim"
    }
  }), /not linked/);
});

test("verified claims become immutable canonical identity", () => {
  const session = buildSession(playerClaims);
  assert.equal(session.player.name, "Lincoln");
  assert.throws(() => { session.player.name = "Impostor"; }, TypeError);
});

test("browser identity fields cannot override appeal identity", () => {
  const session = { subject: "discord:123456789012345678", accountId: "123e4567-e89b-12d3-a456-426614174000" };
  const punishmentId = "123e4567-e89b-12d3-a456-426614174099";
  const submission = sanitizeSubmission({
    punishmentCode: "ABCD-EFGH-JKLM-NPQR-STUV-WXYZ",
    username: "Lincoln",
    ...appealAnswers,
    playerName: "Impostor",
    uuid: "bad"
  });
  assert.deepEqual(buildAppealPayload(submission, session, { punishmentId, username: "Lincoln" }), {
    punishmentId,
    reason: buildReason(appealAnswers),
    accountId: "123e4567-e89b-12d3-a456-426614174000",
    username: "Lincoln"
  });
});

test("review access requires an explicitly configured privileged role", () => {
  const player = buildSession(playerClaims);
  const moderator = buildSession({
    sub: "m",
    custom: {
      minecraft_uuid: "123e4567-e89b-12d3-a456-426614174001",
      minecraft_name: "Mod",
      roles: ["moderator"]
    }
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

test("strict UUID validation supports Java and Floodgate identities", () => {
  assert.equal(isCanonicalUuid("123e4567-e89b-12d3-a456-426614174099"), true);
  assert.equal(isCanonicalUuid("00000000-0000-0000-0009-01f64f65c7c3"), true);
  assert.equal(isCanonicalUuid("zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz"), false);
  assert.equal(isCanonicalUuid("123e4567e89b12d3a456426614174099"), false);
});

test("invalid and oversized submissions are rejected", () => {
  const claim = { punishmentCode: "ABCDEFGHJKLMNPQRSTUVWXYZ", username: "Lincoln" };
  assert.deepEqual(sanitizeClaim({ ...claim, punishmentCode: "ABCD-EFGH-JKLM-NPQR-STUV-WXYZ" }), claim);
  assert.equal(sanitizeClaim({ punishmentCode: "bad code", username: "Lincoln" }), null);
  assert.equal(sanitizeClaim({ punishmentCode: claim.punishmentCode, username: "Invalid name" }), null);
  assert.equal(sanitizeSubmission({ ...claim, ...appealAnswers, whatHappened: "short" }), null);
  assert.equal(sanitizeSubmission({ ...claim, ...appealAnswers, whyReview: "x".repeat(261) }), null);
  assert.equal(sanitizeSubmission({ ...claim, ...appealAnswers, futureSteps: " ".repeat(100) }), null);
  assert.equal(sanitizeSubmission({ ...claim, ...appealAnswers, additionalContext: "x".repeat(101) }), null);
  assert.equal(sanitizeSubmission({ ...claim, ...appealAnswers }).reason, buildReason(appealAnswers));
});

test("private Staff API requests carry a valid replay-protected signature", async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options };
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const env = {
      STAFF_API_BEARER_TOKEN: "b".repeat(32),
      STAFF_API_HMAC_SECRET: "s".repeat(32)
    };
    await signedStaffRequest(env, "/v1/website/appeals/eligible", {
      accountId: "123e4567-e89b-12d3-a456-426614174000"
    });
    assert.equal(captured.url, "https://staff-api.enthusia.info/v1/website/appeals/eligible");
    assert.equal(captured.options.method, "POST");
    assert.equal(captured.options.headers.authorization, `Bearer ${"b".repeat(32)}`);
    assert.match(captured.options.headers["x-enthusia-nonce"], /^[0-9a-f-]{36}$/);
    assert.match(captured.options.headers["x-enthusia-content-sha256"], /^[A-Za-z0-9_-]{43}$/);
    assert.match(captured.options.headers["x-enthusia-signature"], /^[A-Za-z0-9_-]{43}$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("private Staff API rejects routes outside the appeal allowlist", () => {
  assert.throws(() => staffRoute("/v1/public/punishments"), /Invalid Staff API route/);
  assert.equal(staffRoute("/v1/website/punishment-codes/claim"), "/v1/website/punishment-codes/claim");
  assert.equal(publicStaffRoute("/v1/public/punishments"), "/v1/public/punishments");
  assert.throws(() => publicStaffRoute("/v1/website/appeals/eligible"), /Invalid public Staff API route/);
  assert.equal(
    staffRoute("/v1/website/appeals/reviewer/123e4567-e89b-12d3-a456-426614174099/decision"),
    "/v1/website/appeals/reviewer/123e4567-e89b-12d3-a456-426614174099/decision"
  );
});
