import assert from "node:assert/strict";
import test from "node:test";

import { buildAppealPayload } from "../functions/api/appeals.js";
import { requestEligiblePunishments } from "../functions/lib/appeal-eligibility.js";
import { discordAppealAccountId, websiteAppealAccountId } from "../functions/lib/appeal-session.js";

const MINECRAFT_UUID = "123e4567-e89b-42d3-a456-426614174000";
const PUNISHMENT_ID = "123e4567-e89b-42d3-a456-426614174099";
const DISCORD_SUBJECT = `discord:${"3".repeat(18)}`;
const EMAIL_SUBJECT = "email:123e4567-e89b-42d3-a456-426614174777";
const ENV = {
  STAFF_API_TARGET: "production",
  STAFF_API_BEARER_TOKEN: "b".repeat(32),
  STAFF_API_HMAC_SECRET: "s".repeat(32)
};

test("Discord appeal accounts use a stable website ID distinct from Minecraft identity", async () => {
  const one = await discordAppealAccountId(DISCORD_SUBJECT);
  const two = await discordAppealAccountId(DISCORD_SUBJECT);

  assert.match(one, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(one, two);
  assert.notEqual(one, MINECRAFT_UUID);
});

test("verified email identities receive the same opaque website-account UUID contract", async () => {
  const one = await websiteAppealAccountId(EMAIL_SUBJECT);
  const two = await websiteAppealAccountId(EMAIL_SUBJECT);
  assert.match(one, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(one, two);
  assert.notEqual(one, EMAIL_SUBJECT.slice("email:".length));
  await assert.rejects(() => websiteAppealAccountId("email:not-a-uuid"), /identity is invalid/);
});

test("appeal payload keeps the website account binding separate from Minecraft username", async () => {
  const websiteAccountId = await discordAppealAccountId(DISCORD_SUBJECT);
  const submission = {
    punishmentId: PUNISHMENT_ID,
    staffReason: "A sufficiently detailed appeal reason."
  };
  const payload = buildAppealPayload(
    submission,
    { uuid: MINECRAFT_UUID, name: "Lincoln" },
    websiteAccountId,
    "a".repeat(64)
  );

  assert.equal(payload.accountId, websiteAccountId);
  assert.notEqual(payload.accountId, MINECRAFT_UUID);
  assert.equal(payload.username, "Lincoln");
  assert.equal(payload.punishmentId, PUNISHMENT_ID);
});

test("eligibility sends the claimed website account ID to EnthusiaStaff", async () => {
  const websiteAccountId = await discordAppealAccountId(DISCORD_SUBJECT);
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options };
    return new Response(JSON.stringify({ punishments: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const result = await requestEligiblePunishments(ENV, websiteAccountId);
    assert.deepEqual(result.punishments, []);
    assert.equal(captured.url, "https://staff-api.enthusia.info/v1/website/appeals/eligible");
    assert.equal(JSON.parse(new TextDecoder().decode(captured.options.body)).accountId, websiteAccountId);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("eligibility rejects malformed website account IDs before contacting Staff", async () => {
  await assert.rejects(() => requestEligiblePunishments(ENV, "not-an-account-id"), /Website account ID is invalid/);
});
