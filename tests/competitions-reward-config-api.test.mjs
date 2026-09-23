import assert from "node:assert/strict";
import test from "node:test";

import {
  rewardStateResponse,
  rewardUpdate,
  rewardUpdateFailureResponse
} from "../functions/api/competitions/admin/[id]/reward-config.js";

const VALID_REWARDS = {
  definitions: [
    {
      id: "first-place",
      placement: 1,
      rewardType: "MONEY",
      publicLabel: "First place",
      publicDescription: "Awarded to the competition winner.",
      payload: { amount: 5000, currency: "balance" }
    }
  ]
};

test("reward update input validates the version and normalizes its audit note", async () => {
  const update = rewardUpdate({
    expectedVersion: 4,
    rewards: VALID_REWARDS,
    changeNote: "  Updated first-place reward  "
  });
  assert.equal(update.expectedVersion, 4);
  assert.equal(update.changeNote, "Updated first-place reward");
  assert.equal(update.rewards.definitions[0].id, "first-place");

  const missingVersion = rewardUpdate({ rewards: VALID_REWARDS });
  assert.equal(missingVersion.response.status, 400);
  assert.deepEqual(await missingVersion.response.json(), { error: "expected_version_required" });

  const invalidRewards = rewardUpdate({ expectedVersion: 4, rewards: { definitions: "invalid" } });
  assert.equal(invalidRewards.response.status, 400);
  assert.deepEqual(await invalidRewards.response.json(), { error: "invalid_reward_configuration" });
});

test("reward state validation keeps published rewards immutable and reports stale drafts", async () => {
  const locked = rewardStateResponse({ lifecycleState: "UPCOMING", configVersion: 4 }, 4);
  assert.equal(locked.status, 409);
  assert.deepEqual(await locked.json(), { error: "competition_rewards_locked" });

  const stale = rewardStateResponse({ lifecycleState: "DRAFT", configVersion: 5 }, 4);
  assert.equal(stale.status, 409);
  assert.deepEqual(await stale.json(), { error: "competition_version_conflict", currentVersion: 5 });

  assert.equal(rewardStateResponse({ lifecycleState: "DRAFT", configVersion: 4 }, 4), null);
});

test("reward update failures distinguish guarded conflicts from service failures", async () => {
  const conflict = rewardUpdateFailureResponse(new Error("stale_competition_config_version"));
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: "competition_version_conflict" });

  const unavailable = rewardUpdateFailureResponse(new Error("database unavailable"));
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: "competition_rewards_update_failed" });
});
