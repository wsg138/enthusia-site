import assert from "node:assert/strict";
import test from "node:test";

import {
  initialRewardConfig,
  materializeCompetitionRewards,
  publicCompetitionRewards,
  sanitizeCompetitionRewards
} from "../functions/lib/competitions/reward-config.js";

function commandReward(overrides = {}) {
  return {
    id: "first-command",
    placement: 1,
    rewardType: "COMMAND",
    distributionMode: "OWNER_ONLY",
    randomCount: null,
    publicLabel: "Champion reward",
    publicDescription: "A special winner perk.",
    payload: { command: "lp user {uuid} permission set enthusia.winner true" },
    ...overrides
  };
}

test("reward config excludes helpers by default", () => {
  assert.deepEqual(initialRewardConfig(), { definitions: [] });
  const config = sanitizeCompetitionRewards({ definitions: [commandReward()] });
  assert.equal(config.definitions[0].includeHelpers, false);
  assert.equal(config.definitions[0].helperWeight, 0);
});

test("reward config accepts supported definitions and sorts by placement", () => {
  const config = sanitizeCompetitionRewards({
    definitions: [
      commandReward({ id: "second", placement: 2 }),
      {
        id: "first-money",
        placement: 1,
        rewardType: "MONEY",
        distributionMode: "SPLIT_ELIGIBLE",
        includeHelpers: true,
        helperWeight: 0.5,
        publicLabel: "$10,000",
        publicDescription: "Ten thousand Enthusia dollars split between eligible participants.",
        payload: { amount: 10000, currency: "balance" }
      }
    ]
  });

  assert.ok(config);
  assert.deepEqual(config.definitions.map((reward) => reward.id), ["first-money", "second"]);
  assert.equal(config.definitions[0].payload.amount, 10000);
  assert.equal(config.definitions[0].includeHelpers, true);
  assert.equal(config.definitions[0].helperWeight, 0.5);
});

test("helper rewards must be explicitly enabled per reward", () => {
  const config = sanitizeCompetitionRewards({
    definitions: [commandReward({ includeHelpers: true })]
  });
  assert.ok(config);
  assert.equal(config.definitions[0].includeHelpers, true);
  assert.equal(config.definitions[0].helperWeight, 0.5);

  assert.equal(sanitizeCompetitionRewards({
    definitions: [commandReward({ includeHelpers: true, helperWeight: 0 })]
  }), null);
});

test("random reward definitions require a recipient count", () => {
  assert.equal(sanitizeCompetitionRewards({
    definitions: [{
      id: "random-item",
      placement: 1,
      rewardType: "ITEM",
      distributionMode: "RANDOM_ELIGIBLE",
      publicLabel: "Prize item",
      publicDescription: "One participant receives the item.",
      payload: { itemKey: "minecraft:diamond", amount: 1 }
    }]
  }), null);
});

test("public reward projection never exposes command or execution payload", () => {
  const projected = publicCompetitionRewards({ definitions: [commandReward()] });
  assert.equal(projected.definitions.length, 1);
  assert.equal(projected.definitions[0].publicLabel, "Champion reward");
  assert.equal(projected.definitions[0].includeHelpers, false);
  assert.equal("payload" in projected.definitions[0], false);
  assert.equal(JSON.stringify(projected).includes("lp user"), false);
  assert.equal(JSON.stringify(projected).includes("enthusia.winner"), false);
});

test("published reward definitions bind helper policy, source IDs, and config version", () => {
  const records = materializeCompetitionRewards({
    competitionId: "00000000-0000-0000-0000-000000000111",
    configVersion: 7,
    rewards: {
      definitions: [commandReward({ includeHelpers: true, helperWeight: 0.25 })]
    },
    createdAt: "2026-08-23T00:30:00.000Z"
  });

  assert.equal(records.length, 1);
  assert.equal(
    records[0].id,
    "00000000-0000-0000-0000-000000000111:first-command"
  );
  const payload = JSON.parse(records[0].configJson);
  assert.equal(payload.sourceDefinitionId, "first-command");
  assert.equal(payload.configVersion, 7);
  assert.equal(payload.includeHelpers, true);
  assert.equal(payload.helperWeight, 0.25);
  assert.equal(payload.payload.command.includes("enthusia.winner"), true);
});

test("reward definitions reject malformed commands and unsafe identifiers", () => {
  assert.equal(sanitizeCompetitionRewards({
    definitions: [commandReward({ payload: { command: "say hi\nstop" } })]
  }), null);

  assert.equal(sanitizeCompetitionRewards({
    definitions: [commandReward({ id: "bad id" })]
  }), null);
});
