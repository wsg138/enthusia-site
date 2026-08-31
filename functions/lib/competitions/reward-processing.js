import { deliverCompetitionPrize } from "./bridge.js";
import {
  claimRewardDelivery,
  finishRewardDelivery,
  listCompetitionRewardDeliveries
} from "./reward-ledger.js";

const SUCCESS_STATUSES = new Set([
  "DELIVERED",
  "ALREADY_DELIVERED",
  "ACCEPTED",
  "ALREADY_ACCEPTED"
]);

function rewardPayload(delivery) {
  const configured = delivery.detail?.payload;
  const payload = configured && typeof configured === "object" && !Array.isArray(configured)
    ? { ...configured }
    : {};
  if (Number.isSafeInteger(delivery.detail?.amount)) payload.amount = delivery.detail.amount;
  return payload;
}

export function deliveryPayload(competitionId, delivery) {
  return {
    schemaVersion: 1,
    operationKey: delivery.operationKey,
    competitionId,
    submissionId: delivery.submissionId,
    rewardId: delivery.rewardId,
    recipientUuid: delivery.recipientUuid,
    rewardType: delivery.rewardType,
    payload: rewardPayload(delivery)
  };
}

function unchangedOutcome(delivery) {
  if (!["PENDING", "FAILED"].includes(delivery.state)) {
    return { deliveryId: delivery.id, status: "UNCHANGED", state: delivery.state };
  }
  if (!delivery.recipientUuid || delivery.detail?.manual || delivery.detail?.skippedReason) {
    return { deliveryId: delivery.id, status: "UNCHANGED", state: delivery.state };
  }
  return null;
}

function processingDependencies(options) {
  return {
    deliverPrize: typeof options?.deliverPrize === "function" ? options.deliverPrize : deliverCompetitionPrize,
    now: typeof options?.now === "function" ? options.now : () => new Date().toISOString()
  };
}

function bridgeDetail(delivery, bridge, bridgeStatus) {
  return {
    ...(delivery.detail ?? {}),
    bridgeStatus,
    bridgeReference: bridge.reference ?? null,
    bridgeMessage: bridge.message ?? null
  };
}

async function finishBridgeResponse(database, delivery, expectedAttempt, bridge, now) {
  const bridgeStatus = String(bridge.status ?? "").toUpperCase();
  const success = SUCCESS_STATUSES.has(bridgeStatus);
  const finished = await finishRewardDelivery(database, {
    deliveryId: delivery.id,
    expectedAttempt,
    state: success ? "DELIVERED" : "FAILED",
    detail: bridgeDetail(delivery, bridge, bridgeStatus),
    finishedAt: now()
  });
  return {
    deliveryId: delivery.id,
    status: finished ? (success ? "DELIVERED" : "FAILED") : "STATE_CONFLICT",
    bridgeStatus
  };
}

function errorDetail(delivery, error) {
  return {
    ...(delivery.detail ?? {}),
    bridgeStatus: "ERROR",
    bridgeMessage: String(error?.message ?? error).slice(0, 500)
  };
}

async function finishBridgeError(database, delivery, expectedAttempt, error, now) {
  let finished = false;
  try {
    finished = await finishRewardDelivery(database, {
      deliveryId: delivery.id,
      expectedAttempt,
      state: "FAILED",
      detail: errorDetail(delivery, error),
      finishedAt: now()
    });
  } catch {
    finished = false;
  }
  return {
    deliveryId: delivery.id,
    status: finished ? "FAILED" : "STATE_CONFLICT",
    bridgeStatus: "ERROR"
  };
}

async function processClaimedDelivery(env, competitionId, delivery, expectedAttempt, dependencies) {
  try {
    const bridge = await dependencies.deliverPrize(env, deliveryPayload(competitionId, delivery));
    const outcome = await finishBridgeResponse(
      env.COMPETITIONS_DB,
      delivery,
      expectedAttempt,
      bridge,
      dependencies.now
    );
    return outcome;
  } catch (error) {
    return finishBridgeError(env.COMPETITIONS_DB, delivery, expectedAttempt, error, dependencies.now);
  }
}

export async function processCompetitionPrizeDelivery(env, competitionId, delivery, options = {}) {
  const unchanged = unchangedOutcome(delivery);
  if (unchanged) return unchanged;
  const dependencies = processingDependencies(options);
  const expectedAttempt = delivery.attempts + 1;
  const claimed = await claimRewardDelivery(
    env.COMPETITIONS_DB,
    delivery.id,
    delivery.attempts,
    dependencies.now()
  );
  if (!claimed) return { deliveryId: delivery.id, status: "CLAIM_CONFLICT", state: delivery.state };
  return processClaimedDelivery(env, competitionId, delivery, expectedAttempt, dependencies);
}

function safeBatchLimit(value) {
  return Number.isInteger(value) ? Math.min(25, Math.max(1, value)) : 10;
}

function pendingAutomatedDelivery(delivery) {
  return ["PENDING", "FAILED"].includes(delivery.state) && Boolean(delivery.recipientUuid);
}

function deliveryCounts(deliveries) {
  const count = (state) => deliveries.filter((delivery) => delivery.state === state).length;
  return {
    pending: deliveries.filter((delivery) => ["PENDING", "FAILED"].includes(delivery.state)).length,
    delivered: count("DELIVERED"),
    manual: count("MANUAL"),
    skipped: count("SKIPPED")
  };
}

export async function processCompetitionPrizeBatch(env, competitionId, { limit = 10 } = {}) {
  const all = await listCompetitionRewardDeliveries(env.COMPETITIONS_DB, competitionId);
  const candidates = all
    .filter(pendingAutomatedDelivery)
    .slice(0, safeBatchLimit(limit));

  const outcomes = [];
  for (const delivery of candidates) {
    outcomes.push(await processCompetitionPrizeDelivery(env, competitionId, delivery));
  }

  const refreshed = await listCompetitionRewardDeliveries(env.COMPETITIONS_DB, competitionId);
  return {
    attempted: candidates.length,
    outcomes,
    ...deliveryCounts(refreshed),
    deliveries: refreshed
  };
}
