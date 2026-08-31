import assert from "node:assert/strict";
import test from "node:test";

import {
  claimRewardDelivery,
  finishRewardDelivery,
  insertRewardDeliveries,
  listCompetitionRewardDeliveries
} from "../functions/lib/competitions/reward-ledger.js";
import { processCompetitionPrizeDelivery } from "../functions/lib/competitions/reward-processing.js";
import { d1, migratedDatabase } from "./support/d1-sqlite.mjs";

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

async function seededRewardDatabase() {
  const database = await migratedDatabase();
  const now = "2026-08-23T00:45:00.000Z";
  database.prepare(`
    INSERT INTO competitions (
      id, slug, title, category, lifecycle_state, current_config_version,
      created_by_subject, created_by_uuid, created_at, updated_at
    ) VALUES ('competition-1', 'reward-fence', 'Reward Fence', 'Build', 'COMPLETED', 1,
              'staff:test', 'staff-player', ?, ?)
  `).run(now, now);
  database.prepare(`
    INSERT INTO submissions (
      id, competition_id, entry_type, status, owner_subject, owner_uuid,
      owner_name, title, description, revision, created_at, updated_at
    ) VALUES ('submission-1', 'competition-1', 'SOLO', 'APPROVED', 'staff-manual:test',
              'player-1', 'Player', 'Entry', 'Description', 1, ?, ?)
  `).run(now, now);
  database.prepare(`
    INSERT INTO reward_definitions (
      id, competition_id, placement, reward_type, distribution_mode,
      config_json, created_at
    ) VALUES ('reward-1', 'competition-1', 1, 'MONEY', 'OWNER_ONLY', '{}', ?)
  `).run(now);
  database.prepare(`
    INSERT INTO reward_deliveries (
      id, reward_id, submission_id, recipient_uuid, operation_key,
      state, attempts, detail_json, created_at, updated_at
    ) VALUES ('delivery-1', 'reward-1', 'submission-1', 'player-1',
              'reward-fence:delivery-1', 'PENDING', 0,
              '{"payload":{"amount":5000,"currency":"balance"},"amount":2500}', ?, ?)
  `).run(now, now);
  return database;
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
  assert.equal(await claimRewardDelivery(db, "delivery-1", 0, "2026-08-23T00:46:00.000Z"), true);
  assert.match(db.calls[0].sql, /state IN \('PENDING','FAILED'\)/);
  assert.match(db.calls[0].sql, /attempts = attempts \+ 1/);
  assert.match(db.calls[0].sql, /attempts = \?/);

  const stale = fakeDatabase({ runChanges: 0 });
  assert.equal(await claimRewardDelivery(stale, "delivery-1", 0, "2026-08-23T00:46:00.000Z"), false);
});

test("delivery completion only succeeds from DELIVERING and timestamps successful delivery", async () => {
  const db = fakeDatabase({ runChanges: 1 });
  assert.equal(await finishRewardDelivery(db, {
    deliveryId: "delivery-1",
    expectedAttempt: 1,
    state: "DELIVERED",
    detail: { externalReference: "server-ack-1" },
    finishedAt: "2026-08-23T00:47:00.000Z"
  }), true);
  assert.match(db.calls[0].sql, /state = 'DELIVERING'/);
  assert.match(db.calls[0].sql, /attempts = \?/);
  assert.match(db.calls[0].sql, /delivered_at = CASE/);
});

test("stale reward worker cannot finish a later delivery attempt", async () => {
  const database = await seededRewardDatabase();
  const db = d1(database);

  assert.equal(await claimRewardDelivery(db, "delivery-1", 0, "2026-08-23T00:46:00.000Z"), true);
  assert.equal(await finishRewardDelivery(db, {
    deliveryId: "delivery-1",
    expectedAttempt: 1,
    state: "FAILED",
    finishedAt: "2026-08-23T00:47:00.000Z"
  }), true);
  assert.equal(await claimRewardDelivery(db, "delivery-1", 1, "2026-08-23T00:48:00.000Z"), true);

  assert.equal(await finishRewardDelivery(db, {
    deliveryId: "delivery-1",
    expectedAttempt: 1,
    state: "FAILED",
    detail: { lastError: "late attempt one failure" },
    finishedAt: "2026-08-23T00:49:00.000Z"
  }), false);
  assert.deepEqual({ ...database.prepare(`
    SELECT state, attempts FROM reward_deliveries WHERE id = 'delivery-1'
  `).get() }, { state: "DELIVERING", attempts: 2 });

  assert.equal(await finishRewardDelivery(db, {
    deliveryId: "delivery-1",
    expectedAttempt: 2,
    state: "DELIVERED",
    finishedAt: "2026-08-23T00:50:00.000Z"
  }), true);
  database.close();
});

test("shared reward processor sends the documented payload and records success", async () => {
  const database = await seededRewardDatabase();
  const env = { COMPETITIONS_DB: d1(database) };
  const [delivery] = await listCompetitionRewardDeliveries(env.COMPETITIONS_DB, "competition-1");
  const timestamps = [
    "2026-08-23T00:46:00.000Z",
    "2026-08-23T00:47:00.000Z"
  ];
  let payload;
  const result = await processCompetitionPrizeDelivery(env, "competition-1", delivery, {
    now: () => timestamps.shift(),
    async deliverPrize(_env, request) {
      payload = request;
      return { status: "DELIVERED", reference: "bridge-ack-1" };
    }
  });

  assert.deepEqual(result, {
    deliveryId: "delivery-1",
    status: "DELIVERED",
    bridgeStatus: "DELIVERED"
  });
  assert.deepEqual(payload, {
    schemaVersion: 1,
    competitionId: "competition-1",
    submissionId: "submission-1",
    rewardId: "reward-1",
    operationKey: "reward-fence:delivery-1",
    recipientUuid: "player-1",
    rewardType: "MONEY",
    payload: { amount: 2500, currency: "balance" }
  });
  assert.deepEqual({ ...database.prepare(`
    SELECT state, attempts, delivered_at AS deliveredAt
    FROM reward_deliveries WHERE id = 'delivery-1'
  `).get() }, {
    state: "DELIVERED",
    attempts: 1,
    deliveredAt: "2026-08-23T00:47:00.000Z"
  });
  database.close();
});
