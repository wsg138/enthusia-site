import { authenticateRequest } from "../../../../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase
} from "../../../../../lib/competitions/access.js";
import { getAdminCompetition } from "../../../../../lib/competitions/drafts.js";
import {
  completeManualRewardDelivery,
  listCompetitionRewardDeliveries
} from "../../../../../lib/competitions/reward-ledger.js";
import {
  deliveryPayload,
  processCompetitionPrizeDelivery
} from "../../../../../lib/competitions/reward-processing.js";
import { json, methodNotAllowed, unauthorized } from "../../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../../lib/validation.js";

const REWARD_ACTIONS = new Set(["PROCESS_PENDING", "RETRY_ONE", "COMPLETE_MANUAL"]);

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

async function processOne(context, competitionIdValue, delivery) {
  return processCompetitionPrizeDelivery(context.env, competitionIdValue, delivery);
}

function manualNote(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 1000 ? normalized : null;
}

async function actionInput(request) {
  let input;
  try {
    input = await request.json();
  } catch {
    input = null;
  }
  return REWARD_ACTIONS.has(input?.action)
    ? { input }
    : { response: json({ error: "invalid_reward_delivery_action" }, 400) };
}

async function preflight(context) {
  if (!requireSameOrigin(context.request)) return { response: json({ error: "invalid_origin" }, 403) };
  const id = competitionId(context);
  if (!id) return { response: json({ error: "competition_not_found" }, 404) };
  const authorized = await authorizeManager(context);
  if (authorized.response) return authorized;
  const action = await actionInput(context.request);
  return action.response ? action : { id, session: authorized.session, input: action.input };
}

async function rewardWorkspace(database, id) {
  const competition = await getAdminCompetition(database, id);
  if (!competition) return { response: json({ error: "competition_not_found" }, 404) };
  if (!["COMPLETED", "ARCHIVED"].includes(competition.lifecycleState)) {
    return { response: json({ error: "reward_delivery_requires_published_results" }, 409) };
  }
  return { deliveries: await listCompetitionRewardDeliveries(database, id) };
}

function manualCompletion(input, deliveries) {
  const deliveryId = String(input?.deliveryId ?? "").trim();
  const note = manualNote(input?.note);
  if (!deliveryId || !note) {
    return { response: json({ error: "manual_reward_completion_requires_note" }, 400) };
  }
  const delivery = deliveries.find((candidate) => candidate.id === deliveryId);
  if (!delivery) return { response: json({ error: "reward_delivery_not_found" }, 404) };
  if (delivery.state !== "MANUAL") return { response: json({ error: "reward_delivery_not_manual" }, 409) };
  return { deliveryId, note, delivery };
}

function manualCompletionDetail(request, session, completedAt) {
  return {
    ...(request.delivery.detail ?? {}),
    manualCompletion: {
      note: request.note,
      completedByUuid: session.player.uuid,
      completedAt
    }
  };
}

async function completeManualAction(context, id, input, deliveries, session) {
  const request = manualCompletion(input, deliveries);
  if (request.response) return request.response;
  const completedAt = new Date().toISOString();
  const completed = await completeManualRewardDelivery(context.env.COMPETITIONS_DB, {
    deliveryId: request.deliveryId,
    completedAt,
    detail: manualCompletionDetail(request, session, completedAt)
  });
  if (!completed) return json({ error: "manual_reward_completion_conflict" }, 409);
  return json({
    status: "DELIVERED",
    deliveries: await listCompetitionRewardDeliveries(context.env.COMPETITIONS_DB, id)
  });
}

function automatedTargets(input, deliveries) {
  if (input.action === "PROCESS_PENDING") {
    return { targets: deliveries.filter((delivery) => ["PENDING", "FAILED"].includes(delivery.state)) };
  }
  const deliveryId = String(input?.deliveryId ?? "").trim();
  if (!deliveryId) return { response: json({ error: "reward_delivery_id_required" }, 400) };
  const delivery = deliveries.find((candidate) => candidate.id === deliveryId);
  return delivery
    ? { targets: [delivery] }
    : { response: json({ error: "reward_delivery_not_found" }, 404) };
}

async function processAutomatedAction(context, id, input, deliveries) {
  const selection = automatedTargets(input, deliveries);
  if (selection.response) return selection.response;
  const processed = [];
  for (const delivery of selection.targets) {
    processed.push(await processOne(context, id, delivery));
  }
  return json({
    processed,
    deliveries: await listCompetitionRewardDeliveries(context.env.COMPETITIONS_DB, id)
  });
}

function executeAction(context, request, deliveries) {
  return request.input.action === "COMPLETE_MANUAL"
    ? completeManualAction(context, request.id, request.input, deliveries, request.session)
    : processAutomatedAction(context, request.id, request.input, deliveries);
}

export async function onRequestPost(context) {
  const request = await preflight(context);
  if (request.response) return request.response;
  try {
    const workspace = await rewardWorkspace(context.env.COMPETITIONS_DB, request.id);
    if (workspace.response) return workspace.response;
    const response = await executeAction(context, request, workspace.deliveries);
    return response;
  } catch {
    return json({ error: "reward_delivery_processing_failed" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["POST"]);
}

export { deliveryPayload, manualNote, processOne };
