import assert from "node:assert/strict";
import test from "node:test";
import { buildSession, canReview } from "../functions/lib/auth.js";
import { buildAppealPayload, sanitizeSubmission } from "../functions/api/appeals.js";
import { sanitizeDecision } from "../functions/api/reviewer/appeals/[id].js";
import { boundedIdempotencyKey, enforceRateLimit, requireSameOrigin } from "../functions/lib/security.js";

test("buildSession requires a linked canonical player", () => {
  assert.throws(() => buildSession({ sub: "user-1", email: "player@example.com" }), /not linked/);
});

test("verified claims become immutable canonical identity", () => {
  const session = buildSession({ sub: "user-1", custom: { minecraft_uuid: "123e4567-e89b-12d3-a456-426614174000", minecraft_name: "Lincoln", roles: ["player"] } });
  assert.equal(session.player.name, "Lincoln");
  assert.throws(() => { session.player.name = "Impostor"; }, TypeError);
});

test("browser identity fields cannot override appeal identity", () => {
  const session = buildSession({ sub: "user-1", custom: { minecraft_uuid: "123e4567-e89b-12d3-a456-426614174000", minecraft_name: "Lincoln" } });
  const submission = sanitizeSubmission({ punishmentId: "ban-42", reason: "Please review", playerName: "Impostor", uuid: "bad" });
  assert.deepEqual(buildAppealPayload(submission, session), { punishmentId: "ban-42", reason: "Please review", appellant: { uuid: "123e4567-e89b-12d3-a456-426614174000", name: "Lincoln", subject: "user-1" } });
});

test("review access requires an explicitly configured privileged role", () => {
  const player = buildSession({ sub: "p", custom: { minecraft_uuid: "123e4567e89b12d3a456426614174000", minecraft_name: "Player", roles: ["player"] } });
  const moderator = buildSession({ sub: "m", custom: { minecraft_uuid: "123e4567e89b12d3a456426614174001", minecraft_name: "Mod", roles: ["moderator"] } });
  const env = { APPEAL_REVIEWER_ROLES: "admin,moderator" };
  assert.equal(canReview(player, env), false);
  assert.equal(canReview(moderator, env), true);
});

test("mutation requests require the exact site origin", () => {
  assert.equal(requireSameOrigin(new Request("https://enthusia.example/api/appeals", { headers: { origin: "https://enthusia.example" } })), true);
  assert.equal(requireSameOrigin(new Request("https://enthusia.example/api/appeals", { headers: { origin: "https://evil.example" } })), false);
});

test("rate limiter fails closed and bounds a window", async () => {
  assert.equal((await enforceRateLimit(null, "user")).allowed, false);
  const values = new Map();
  const kv = { get: (key) => values.get(key), put: (key, value) => values.set(key, value) };
  assert.equal((await enforceRateLimit(kv, "user", 1, 60, 0)).allowed, true);
  assert.equal((await enforceRateLimit(kv, "user", 1, 60, 1)).allowed, false);
});

test("review decisions require version and replay key", () => {
  assert.deepEqual(sanitizeDecision({ decision: "approve", expectedVersion: 2, note: "ok", idempotencyKey: "decision-123" }), { decision: "approve", expectedVersion: 2, note: "ok", idempotencyKey: "decision-123" });
  assert.equal(sanitizeDecision({ decision: "approve", expectedVersion: -1, idempotencyKey: "decision-123" }), null);
  assert.equal(boundedIdempotencyKey("short"), null);
});

test("invalid and oversized submissions are rejected", () => {
  assert.equal(sanitizeSubmission({ punishmentId: "", reason: "x" }), null);
  assert.equal(sanitizeSubmission({ punishmentId: "ban", reason: "x".repeat(4001) }), null);
});
