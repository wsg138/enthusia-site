import test from "node:test";
import assert from "node:assert/strict";

import {
  safeGuilds,
  safeLinkedAccounts
} from "../functions/api/competitions/[slug]/me.js";
import { changeNote } from "../functions/api/competitions/admin/[id]/reward-config.js";
import {
  deliveryPayload,
  manualNote
} from "../functions/api/competitions/admin/[id]/rewards/process.js";
import { groupRows } from "../functions/api/competitions/judge/[id].js";

const JAVA_UUID = "123e4567-e89b-42d3-a456-426614174000";
const ALT_UUID = "223e4567-e89b-42d3-a456-426614174001";

test("participant context only returns canonical linked Minecraft accounts and always preserves the authenticated player", () => {
  const session = { player: { uuid: JAVA_UUID, name: "Owner" } };
  const accounts = safeLinkedAccounts({
    linkedMinecraftAccounts: [
      { uuid: ALT_UUID, name: "AltPlayer" },
      { uuid: "not-a-uuid", name: "Bad" },
      { uuid: JAVA_UUID, name: "Owner" }
    ]
  }, session);

  assert.deepEqual(accounts, [
    { uuid: ALT_UUID, name: "AltPlayer" },
    { uuid: JAVA_UUID, name: "Owner" }
  ]);
});

test("guild context exposes only safe identity plus whether the configured submission permission is present", () => {
  const guilds = safeGuilds({
    guilds: [
      { id: "guild-one", name: "Builders", permissions: ["competition.submit", "claims.break"] },
      { id: "guild-two", name: "Visitors", permissions: ["claims.break"] },
      { id: "", name: "Broken", permissions: ["competition.submit"] }
    ]
  }, "competition.submit");

  assert.deepEqual(guilds, [
    { id: "guild-one", name: "Builders", canSubmit: true },
    { id: "guild-two", name: "Visitors", canSubmit: false }
  ]);
  assert.equal("permissions" in guilds[0], false);
});

test("reward config change notes are bounded and receive a useful default", () => {
  assert.equal(changeNote(undefined), "Competition rewards updated");
  assert.equal(changeNote("  changed prize split  "), "changed prize split");
  assert.equal(changeNote("x".repeat(501)), null);
});

test("bridge reward payload uses the ledger operation key and split amount override", () => {
  const payload = deliveryPayload("competition-1", {
    rewardId: "reward-1",
    submissionId: "submission-1",
    operationKey: "competition-reward:reward-1:submission-1:player-1",
    recipientUuid: JAVA_UUID,
    rewardType: "MONEY",
    detail: {
      payload: { amount: 5000, currency: "balance" },
      amount: 2500
    }
  });

  assert.deepEqual(payload, {
    schemaVersion: 1,
    competitionId: "competition-1",
    submissionId: "submission-1",
    rewardId: "reward-1",
    operationKey: "competition-reward:reward-1:submission-1:player-1",
    recipientUuid: JAVA_UUID,
    rewardType: "MONEY",
    payload: { amount: 2500, currency: "balance" }
  });
});

test("manual reward completion requires a non-empty bounded audit note", () => {
  assert.equal(manualNote("  handed out at spawn  "), "handed out at spawn");
  assert.equal(manualNote(""), null);
  assert.equal(manualNote("x".repeat(1001)), null);
});

test("judge workspace groups participants and images by submission without leaking groups together", () => {
  const grouped = groupRows([
    { submissionId: "a", value: 1 },
    { submissionId: "b", value: 2 },
    { submissionId: "a", value: 3 }
  ]);
  assert.deepEqual(grouped.get("a").map((row) => row.value), [1, 3]);
  assert.deepEqual(grouped.get("b").map((row) => row.value), [2]);
});
