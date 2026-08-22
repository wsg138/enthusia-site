import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultRewardDistribution,
  rewardOperationKey,
  selectRewardRecipients,
  splitIntegerReward,
  validateRewardDefinition
} from "../functions/lib/competitions/rewards.js";

test("divisible rewards default to splitting while ranks/lore items do not", () => {
  assert.equal(defaultRewardDistribution("MONEY"), "SPLIT_ELIGIBLE");
  assert.equal(defaultRewardDistribution("ITEM"), "SPLIT_ELIGIBLE");
  assert.equal(defaultRewardDistribution("RANK"), "OWNER_ONLY");
  assert.equal(defaultRewardDistribution("LORE_ITEM"), "OWNER_ONLY");
});

test("non-divisible rewards cannot use split distribution", () => {
  assert.deepEqual(validateRewardDefinition({
    placement: 1,
    rewardType: "RANK",
    distributionMode: "SPLIT_ELIGIBLE"
  }), ["non_divisible_reward_cannot_split"]);
});

test("random reward modes require a positive recipient count", () => {
  assert.ok(validateRewardDefinition({
    placement: 1,
    rewardType: "RANK",
    distributionMode: "RANDOM_ELIGIBLE",
    randomCount: 0
  }).includes("random_recipient_count_invalid"));
});

test("recipient selection de-duplicates candidates and supports owner/all/random modes", () => {
  assert.deepEqual(selectRewardRecipients({
    distributionMode: "OWNER_ONLY",
    ownerUuid: "owner"
  }), ["owner"]);

  assert.deepEqual(selectRewardRecipients({
    distributionMode: "EACH_ELIGIBLE",
    eligibleParticipantUuids: ["b", "a", "a"]
  }), ["a", "b"]);

  assert.deepEqual(selectRewardRecipients({
    distributionMode: "RANDOM_ELIGIBLE",
    eligibleParticipantUuids: ["a", "b", "c"],
    randomCount: 2,
    random: () => 0
  }), ["a", "b"]);
});

test("integer reward splitting preserves the exact total and is deterministic", () => {
  const shares = splitIntegerReward(10, ["c", "a", "b"]);
  assert.deepEqual(shares, [
    { recipientUuid: "a", amount: 4 },
    { recipientUuid: "b", amount: 3 },
    { recipientUuid: "c", amount: 3 }
  ]);
  assert.equal(shares.reduce((sum, share) => sum + share.amount, 0), 10);
});

test("reward operation keys are stable per reward/submission/recipient", () => {
  assert.equal(
    rewardOperationKey("reward-1", "submission-2", "player-3"),
    "competition-reward:reward-1:submission-2:player-3"
  );
  assert.throws(() => rewardOperationKey("bad key", "submission", "player"));
});
