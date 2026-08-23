import assert from "node:assert/strict";
import test from "node:test";

import {
  claimRewardDelivery,
  finishRewardDelivery,
  insertRewardDeliveries,
  listCompetitionRewardDeliveries
} from "../functions/lib/competitions/reward-ledger.js";

function fakeDatabase({ batchChanges = [], rows = [], runChanges = 1 } = {}) {
  const calls = [];
  const db = {
    calls,
    prepare(sql) {
      const call = { sql, bindings: [] };
      calls.push(call);
      return {
        bind(...bindings) {
          call.bindings = bindings;
          return this;
        },
        async all() {
          return { results: rows };
        },
        async run() {
          return { meta: { changes: runChanges } };
        }
      };
    },
    async batch(statements) {
      db.batchStatements = statements;
      return statements.map((_, index) => ({
        meta: { changes: batchChanges[index] ?? 1 }
      }));
    }
  };
  return db;
}

test("delivery insertion uses operation-key idempotency and reports ignored replays", async () => {
  const db = fakeDatabase({ batchChanges: [1, 0] });
  const result = await insertRewardDeliveries(db, [
    {
      id: "delivery-1",
      rewardId: "competition-1:first-money",
      submissionId: "submission-1",
      recipientUuid: "player-1",
      operationKey: "competition-reward:reward-1:submission-1:player-1",
      state: "PENDING",
      detail: { amount: 5000 }
    },
    {
      id: "delivery-2",
      rewardId: "competition-1:first-money",
      submissionId: "submission-1",
      recipientUuid: "player-2",
      operationKey: "competition-reward:reward-1:submission-1:player-2",
      state: "PENDING",
      detail: { amount: 5000 }
    }
  ], "2026-08-23T00:45:00.000Z");

  assert.deepEqual(result, { requested: 2, inserted: 1 });
  assert.equal(db.batchStatements.length, 2);
  assert.match(db.calls[0].sql, /INSERT OR IGNORE INTO reward_deliveries/);
});

test("one plan cannot contain duplicate operation keys", async () => {
  const db = fakeDatabase();
  await assert.rejects(() => insertRewardDeliveries(db, [
    {
      id: "delivery-1",
      rewardId: "reward-1",
      submissionId: "submission-1",
      recipientUuid: "player-1",
      operationKey: "same-key",
      state: "PENDING"
    },
    {
      id: "delivery-2",
      rewardId: "reward-1",
      submissionId: "submission-1",
      recipientUuid: "player-2",
      operationKey: "same-key",
      state: "PENDING"
    }
  ], "2026-08-23T00:45:00.000Z"), /unique within a plan/);
});

test("ledger list is scoped through reward definitions to one competition", async () => {
  const db = fakeDatabase({
    rows: [{
      id: "delivery-1",
      rewardId: "reward-1",
      submissionId: "submission-1",
      recipientUuid: "player-1",
      operationKey: "key",
      state: "PENDING",
      attempts: 0,
      detailJson: "{\"amount\":100}",
      createdAt: "now",
      updatedAt: "now",
      deliveredAt: null,
      placement: 1,
      rewardType: "MONEY",
      distributionMode: "SPLIT_ELIGIBLE",
      submissionTitle: "Entry",
      ownerName: "Player"
    }]
  });

  const deliveries = await listCompetitionRewardDeliveries(db, "competition-1");
  assert.match(db.calls[0].sql, /JOIN reward_definitions/);
  assert.match(db.calls[0].sql, /r\.competition_id = \?/);
  assert.deepEqual(db.calls[0].bindings, ["competition-1"]);
  assert.equal(deliveries[0].detail.amount, 100);
  assert.equal(deliveries[0].detailJson, undefined);
});

test("claim transition is concurrency-safe and increments attempts", async () => {
  const db = fakeDatabase({ runChanges: 1 });
  assert.equal(await claimRewardDelivery(db, "delivery-1", "2026-08-23T00:46:00.000Z"), true);
  assert.match(db.calls[0].sql, /state IN \('PENDING','FAILED'\)/);
  assert.match(db.calls[0].sql, /attempts = attempts \+ 1/);

  const stale = fakeDatabase({ runChanges: 0 });
  assert.equal(await claimRewardDelivery(stale, "delivery-1", "2026-08-23T00:46:00.000Z"), false);
});

test("delivery completion only succeeds from DELIVERING and timestamps successful delivery", async () => {
  const db = fakeDatabase({ runChanges: 1 });
  assert.equal(await finishRewardDelivery(db, {
    deliveryId: "delivery-1",
    state: "DELIVERED",
    detail: { externalReference: "server-ack-1" },
    finishedAt: "2026-08-23T00:47:00.000Z"
  }), true);
  assert.match(db.calls[0].sql, /state = 'DELIVERING'/);
  assert.match(db.calls[0].sql, /delivered_at = CASE/);
});
