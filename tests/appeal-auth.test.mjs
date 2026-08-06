import assert from "node:assert/strict";
import test from "node:test";
import { buildSession, canReview } from "../functions/lib/auth.js";
import { buildAppealPayload, sanitizeSubmission } from "../functions/api/appeals.js";

test("buildSession requires a linked canonical player", () => {
  assert.throws(() => buildSession({ sub: "user-1", email: "player@example.com" }), /not linked/);
});

test("verified claims become immutable canonical identity", () => {
  const session = buildSession({
    sub: "user-1",
    custom: { minecraft_uuid: "123e4567-e89b-12d3-a456-426614174000", minecraft_name: "Lincoln", roles: ["player"] },
  });
  assert.equal(session.player.name, "Lincoln");
  assert.throws(() => { session.player.name = "Impostor"; }, TypeError);
});

test("browser identity fields cannot override appeal identity", () => {
  const session = buildSession({
    sub: "user-1",
    custom: { minecraft_uuid: "123e4567-e89b-12d3-a456-426614174000", minecraft_name: "Lincoln" },
  });
  const submission = sanitizeSubmission({ punishmentId: "ban-42", reason: "Please review", playerName: "Impostor", uuid: "bad" });
  assert.deepEqual(buildAppealPayload(submission, session), {
    punishmentId: "ban-42",
    reason: "Please review",
    appellant: { uuid: "123e4567-e89b-12d3-a456-426614174000", name: "Lincoln", subject: "user-1" },
  });
});

test("review access requires an explicitly configured privileged role", () => {
  const player = buildSession({ sub: "p", custom: { minecraft_uuid: "123e4567e89b12d3a456426614174000", minecraft_name: "Player", roles: ["player"] } });
  const moderator = buildSession({ sub: "m", custom: { minecraft_uuid: "123e4567e89b12d3a456426614174001", minecraft_name: "Mod", roles: ["moderator"] } });
  const env = { APPEAL_REVIEWER_ROLES: "admin,moderator" };
  assert.equal(canReview(player, env), false);
  assert.equal(canReview(moderator, env), true);
});

test("invalid and oversized submissions are rejected", () => {
  assert.equal(sanitizeSubmission({ punishmentId: "", reason: "x" }), null);
  assert.equal(sanitizeSubmission({ punishmentId: "ban", reason: "x".repeat(4001) }), null);
});
