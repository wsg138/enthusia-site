import assert from "node:assert/strict";
import test from "node:test";
import { automaticPunishmentAppeals, requestAccountPunishments } from "../functions/lib/account-punishments.js";
import { onRequestPost as claim } from "../functions/api/appeals/claim.js";
import { onRequestGet as bindings } from "../functions/api/appeals/bindings.js";
import { onRequestPost as revalidate } from "../functions/api/appeals/revalidate.js";

const PLAYER = "123e4567-e89b-42d3-a456-426614174000";
const OTHER = "123e4567-e89b-42d3-a456-426614174111";
const PUNISHMENT = "123e4567-e89b-42d3-a456-426614174099";
const env = { LINKED_PUNISHMENT_APPEALS: "true", STAFF_API_TARGET: "production", STAFF_API_BEARER_TOKEN: "b".repeat(32), STAFF_API_HMAC_SECRET: "s".repeat(32) };
const session = { discord: { id: "333333333333333333" }, linkedMinecraftAccounts: [{ uuid: PLAYER, name: "*Bedrock Player" }] };
function row(overrides = {}) {
  return { id: PUNISHMENT, caseId: "0000000000000001", type: "WARN", reason: "Public reason", createdAt: "2026-10-01T00:00:00Z", minecraftUuid: PLAYER, minecraftName: "Untrusted Name", active: false, expiresAt: "2026-10-02T00:00:00Z", nextAppealAt: "2026-10-28T00:00:00Z", appealable: false, internalExplanation: "Private evidence", ...overrides };
}
async function withUpstream(payload, action) {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), body: JSON.parse(new TextDecoder().decode(options.body)) });
    return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
  };
  try { return await action(requests); } finally { globalThis.fetch = original; }
}

test("automatic punishment appeals require an explicit activation flag", () => {
  assert.equal(automaticPunishmentAppeals({}), false);
  assert.equal(automaticPunishmentAppeals({ LINKED_PUNISHMENT_APPEALS: "false" }), false);
  assert.equal(automaticPunishmentAppeals(env), true);
});

test("owned punishment lookup uses the verified Discord identity and strips private fields", async () => {
  await withUpstream({ punishments: [row()], nextCursor: "YWJj" }, async requests => {
    const page = await requestAccountPunishments(env, session, { minecraftUuid: PLAYER, scope: "EXPIRED", cursor: "YWJj" });
    assert.deepEqual(requests[0].body, { discordUserId: session.discord.id, scope: "EXPIRED", minecraftUuid: PLAYER, cursor: "YWJj" });
    assert.match(requests[0].url, /\/v1\/website\/appeals\/linked$/);
    assert.equal(page.punishments[0].minecraftName, "*Bedrock Player");
    assert.equal(page.punishments[0].internalExplanation, undefined);
    assert.equal(page.punishments[0].active, false);
    assert.equal(page.punishments[0].appealable, false);
    assert.equal(page.punishments[0].nextAppealAt, "2026-10-28T00:00:00Z");
  });
});

test("foreign or malformed upstream punishments fail the entire lookup closed", async () => {
  for (const overrides of [{ minecraftUuid: OTHER }, { createdAt: "not-a-date" }, { expiresAt: undefined }, { active: "true" }, { appealable: null }]) {
    await withUpstream({ punishments: [row(overrides)] }, () => assert.rejects(requestAccountPunishments(env, session), /Invalid/));
  }
});

test("unowned account and invalid cursor or scope never reach the native API", async () => {
  await withUpstream({ punishments: [] }, async requests => {
    for (const filter of [{ minecraftUuid: OTHER }, { scope: "PRIVATE" }, { cursor: "../other" }]) {
      await assert.rejects(requestAccountPunishments(env, session, filter));
    }
    await assert.rejects(requestAccountPunishments(env, { ...session, discord: null }));
    assert.equal(requests.length, 0);
  });
});

test("binding and revalidation endpoints retire when automatic ownership is activated", async () => {
  const request = new Request("https://enthusia.info/api/appeals/claim", { method: "POST", headers: { origin: "https://enthusia.info" } });
  for (const route of [claim, bindings, revalidate]) {
    const response = await route({ env, request });
    assert.equal(response.status, 410);
    assert.equal((await response.json()).error, "punishment_binding_removed");
  }
  assert.equal((await claim({ env, request: new Request("https://enthusia.info/api/appeals/claim", { method: "POST", headers: { origin: "https://evil.example" } }) })).status, 403);
});
