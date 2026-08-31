import { authenticateRequest } from "../../../../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase
} from "../../../../../lib/competitions/access.js";
import { deliverCompetitionPrize } from "../../../../../lib/competitions/bridge.js";
import { getAdminCompetition } from "../../../../../lib/competitions/drafts.js";
import {
  claimRewardDelivery,
  completeManualRewardDelivery,
  finishRewardDelivery,
  listCompetitionRewardDeliveries
} from "../../../../../lib/competitions/reward-ledger.js";
import { json, methodNotAllowed, unauthorized } from "../../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../../lib/validation.js";

const SUCCESS_STATUSES = new Set(["DELIVERED", "ALREADY_DELIVERED", "ACCEPTED", "ALREADY_ACCEPTED"]);

function competitionId(context) {
  const value = typeof context?.params?.id === "string" ? context.params.id.trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
}

async function authorizeManager(context) {
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
  if (!hasCompetitionDatabase(context.env)) return { response: json({ error: "competition_database_unavailable" }, 503) };
  let session;
  try {
    session = await authenticateRequest(context.request, context.env);
  } catch {
    return { response: unauthorized() };
  }
  if (!canManageCompetitions(session, context.env)) {
    return { response: json({ error: "competition_manager_required" }, 403) };
  }
  return { session };
}

function deliveryPayload(competitionIdValue, delivery) {
  const payload = delivery.detail?.payload && typeof delivery.detail.payload === "object"
    ? { ...delivery.detail.payload }
    : {};
  if (Number.isSafeInteger(delivery.detail?.amount)) payload.amount = delivery.detail.amount;
  return {
    schemaVersion: 1,
    competitionId: competitionIdValue,
    submissionId: delivery.submissionId,
    rewardId: delivery.rewardId,
    operationKey: delivery.operationKey,
    recipientUuid: delivery.recipientUuid,
    rewardType: delivery.rewardType,
    payload
  };
}

async function processOne(context, competitionIdValue, delivery) {
  if (!["PENDING", "FAILED"].includes(delivery.state)) {
    return { deliveryId: delivery.id, status: "UNCHANGED", state: delivery.state };
  }
  if (!delivery.recipientUuid || delivery.detail?.manual || delivery.detail?.skippedReason) {
    return { deliveryId: delivery.id, status: "UNCHANGED", state: delivery.state };
  }

  const startedAt = new Date().toISOString();
  const expectedAttempt = delivery.attempts + 1;
  const claimed = await claimRewardDelivery(
    context.env.COMPETITIONS_DB,
    delivery.id,
    delivery.attempts,
    startedAt
  );
  if (!claimed) return { deliveryId: delivery.id, status: "CLAIM_CONFLICT", state: delivery.state };

  try {
    const bridge = await deliverCompetitionPrize(context.env, deliveryPayload(competitionIdValue, delivery));
    const bridgeStatus = String(bridge.status ?? "").toUpperCase();
    const success = SUCCESS_STATUSES.has(bridgeStatus);
    const finishedAt = new Date().toISOString();
    await finishRewardDelivery(context.env.COMPETITIONS_DB, {
      deliveryId: delivery.id,
      expectedAttempt,
      state: success ? "DELIVERED" : "FAILED",
      detail: {
        ...(delivery.detail ?? {}),
        bridgeStatus,
        bridgeReference: bridge.reference ?? null,
        bridgeMessage: bridge.message ?? null
      },
      finishedAt
    });
    return {
      deliveryId: delivery.id,
      status: success ? "DELIVERED" : "FAILED",
      bridgeStatus
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    await finishRewardDelivery(context.env.COMPETITIONS_DB, {
      deliveryId: delivery.id,
      expectedAttempt,
      state: "FAILED",
      detail: {
        ...(delivery.detail ?? {}),
        bridgeStatus: "ERROR",
        bridgeMessage: String(error?.message ?? error).slice(0, 500)
      },
      finishedAt
    }).catch(() => {});
    return { deliveryId: delivery.id, status: "FAILED", bridgeStatus: "ERROR" };
  }
}

function manualNote(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 1000 ? normalized : null;
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const id = competitionId(context);
  if (!id) return json({ error: "competition_not_found" }, 404);
  const authorized = await authorizeManager(context);
  if (authorized.response) return authorized.response;

  let input;
  try {
    input = await context.request.json();
  } catch {
    input = null;
  }
  if (!new Set(["PROCESS_PENDING", "RETRY_ONE", "COMPLETE_MANUAL"]).has(input?.action)) {
    return json({ error: "invalid_reward_delivery_action" }, 400);
  }

  try {
    const competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
    if (!competition) return json({ error: "competition_not_found" }, 404);
    if (!["COMPLETED", "ARCHIVED"].includes(competition.lifecycleState)) {
      return json({ error: "reward_delivery_requires_published_results" }, 409);
    }

    const deliveries = await listCompetitionRewardDeliveries(context.env.COMPETITIONS_DB, id);
    if (input.action === "COMPLETE_MANUAL") {
      const deliveryId = String(input?.deliveryId ?? "").trim();
      const note = manualNote(input?.note);
      if (!deliveryId || !note) return json({ error: "manual_reward_completion_requires_note" }, 400);
      const delivery = deliveries.find((candidate) => candidate.id === deliveryId);
      if (!delivery) return json({ error: "reward_delivery_not_found" }, 404);
      if (delivery.state !== "MANUAL") return json({ error: "reward_delivery_not_manual" }, 409);
      const completedAt = new Date().toISOString();
      const completed = await completeManualRewardDelivery(context.env.COMPETITIONS_DB, {
        deliveryId,
        completedAt,
        detail: {
          ...(delivery.detail ?? {}),
          manualCompletion: {
            note,
            completedByUuid: authorized.session.player.uuid,
            completedAt
          }
        }
      });
      if (!completed) return json({ error: "manual_reward_completion_conflict" }, 409);
      return json({ status: "DELIVERED", deliveries: await listCompetitionRewardDeliveries(context.env.COMPETITIONS_DB, id) });
    }

    let targets;
    if (input.action === "RETRY_ONE") {
      const deliveryId = String(input?.deliveryId ?? "").trim();
      if (!deliveryId) return json({ error: "reward_delivery_id_required" }, 400);
      const delivery = deliveries.find((candidate) => candidate.id === deliveryId);
      if (!delivery) return json({ error: "reward_delivery_not_found" }, 404);
      targets = [delivery];
    } else {
      targets = deliveries.filter((delivery) => ["PENDING", "FAILED"].includes(delivery.state));
    }

    const processed = [];
    for (const delivery of targets) {
      processed.push(await processOne(context, id, delivery));
    }
    const current = await listCompetitionRewardDeliveries(context.env.COMPETITIONS_DB, id);
    return json({ processed, deliveries: current });
  } catch (error) {
    return json({ error: "reward_delivery_processing_failed", detail: String(error?.message ?? error) }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["POST"]);
}

export { deliveryPayload, manualNote, processOne };
