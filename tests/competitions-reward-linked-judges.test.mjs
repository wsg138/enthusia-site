import assert from "node:assert/strict";
import test from "node:test";

import { planRewardForResult } from "../functions/lib/competitions/reward-plans.js";

function reward(distributionMode, overrides = {}) {
  return {
    id: "reward-1",
    competitionId: "competition-1",
    placement: 1,
    rewardType: overrides.rewardType ?? "RANK",
    distributionMode,
    config: {
      publicLabel: "Winner",
      publicDescription: "Winner reward",
      payload: overrides.payload ?? {},
      sourceDefinitionId: "definition-1",
      configVersion: 1,
      includeHelpers: overrides.includeHelpers ?? true,
      helperWeight: overrides.helperWeight ?? 0.5,
      randomCount: overrides.randomCount ?? 1
    }
  };
}

function context(entryType = "GROUP") {
  return {
    submissionId: "submission-1",
    entryType,
    ownerUuid: "owner",
    ownerName: "Owner",
    guildId: entryType === "GUILD" ? "guild-1" : null,
    participants: [
      { playerUuid: "main", playerName: "Main", role: "MAIN", inviteStatus: "ACCEPTED" },
      { playerUuid: "judge-alt", playerName: "JudgeAlt", role: "HELPER", inviteStatus: "ACCEPTED" }
    ],
    judgeUuids: new Set(["judge", "judge-alt"])
  };
}

test("a helper linked to an assigned judge receives no participant reward", () => {
  const planned = planRewardForResult(reward("EACH_ELIGIBLE"), context());
  assert.deepEqual(planned.deliveries.map((delivery) => delivery.recipientUuid).sort(), ["main", "owner"]);
});

test("linked judge identities are excluded from whole-guild reward pools", () => {
  const planned = planRewardForResult(
    reward("ALL_GUILD_MEMBERS"),
    context("GUILD"),
    { guildMemberUuids: ["worker", "judge", "judge-alt"] }
  );
  assert.deepEqual(planned.deliveries.map((delivery) => delivery.recipientUuid), ["worker"]);
});
