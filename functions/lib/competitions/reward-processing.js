import { deliverCompetitionPrize } from "./bridge.js";
import {
  claimRewardDelivery,
  finishRewardDelivery,
  listCompetitionRewardDeliveries
} from "./reward-ledger.js";

function bridgePayload(delivery) {
  return {
    operationKey: delivery.operationKey,
    competitionId: delivery.detail?.competitionId ?? null,
    submissionId: delivery.submissionId,
    rewardId: delivery.rewardId,
    recipientUuid: delivery.recipientUuid,
    rewardType: delivery.detail?.rewardType,
    payload: delivery.detail?.payload,
    configVersion: delivery.detail?.configVersion ?? null
  };
}

export async function processCompetitionPrizeBatch(env, competitionId, { limit = 10 } = {}) {
  const safeLimit = Number.isInteger(limit) ? Math.min(25, Math.max(1, limit)) : 10;
  const all = await listCompetitionRewardDeliveries(env.COMPETITIONS_DB, competitionId);
  const candidates = all
    .filter((delivery) => (delivery.state === "PENDING" || delivery.state === "FAILED") && delivery.recipientUuid)
    .slice(0, safeLimit);

  const outcomes = [];
  for (const delivery of candidates) {
    const claimedAt = new Date().toISOString();
    const expectedAttempt = delivery.attempts + 1;
    const claimed = await claimRewardDelivery(
      env.COMPETITIONS_DB,
      delivery.id,
      delivery.attempts,
      claimedAt
    );
    if (!claimed) {
      outcomes.push({ deliveryId: delivery.id, status: "NOT_CLAIMED" });
      continue;
    }

    try {
      const bridge = await deliverCompetitionPrize(env, bridgePayload(delivery));
      const accepted = bridge.status === "DELIVERED" || bridge.status === "ALREADY_DELIVERED";
      if (!accepted) throw new Error(`Bridge returned unsupported delivery status ${bridge.status}`);
      const finishedAt = new Date().toISOString();
      const finished = await finishRewardDelivery(env.COMPETITIONS_DB, {
        deliveryId: delivery.id,
        expectedAttempt,
        state: "DELIVERED",
        detail: {
          ...delivery.detail,
          bridgeStatus: bridge.status,
          bridgeReference: bridge.reference ?? null
        },
        finishedAt
      });
      outcomes.push({ deliveryId: delivery.id, status: finished ? "DELIVERED" : "STATE_CONFLICT" });
    } catch (error) {
      const finishedAt = new Date().toISOString();
      await finishRewardDelivery(env.COMPETITIONS_DB, {
        deliveryId: delivery.id,
        expectedAttempt,
        state: "FAILED",
        detail: {
          ...delivery.detail,
          lastError: String(error?.message ?? error).slice(0, 500)
        },
        finishedAt
      }).catch(() => {});
      outcomes.push({ deliveryId: delivery.id, status: "FAILED", error: String(error?.message ?? error) });
    }
  }

  const refreshed = await listCompetitionRewardDeliveries(env.COMPETITIONS_DB, competitionId);
  return {
    attempted: candidates.length,
    outcomes,
    pending: refreshed.filter((delivery) => delivery.state === "PENDING" || delivery.state === "FAILED").length,
    delivered: refreshed.filter((delivery) => delivery.state === "DELIVERED").length,
    manual: refreshed.filter((delivery) => delivery.state === "MANUAL").length,
    skipped: refreshed.filter((delivery) => delivery.state === "SKIPPED").length,
    deliveries: refreshed
  };
}
