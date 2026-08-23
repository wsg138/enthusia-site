import { authenticateRequest } from "../../../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase
} from "../../../../lib/competitions/access.js";
import { competitionGuildMembers } from "../../../../lib/competitions/bridge.js";
import { getAdminCompetition } from "../../../../lib/competitions/drafts.js";
import {
  insertRewardDeliveries,
  listCompetitionRewardDeliveries
} from "../../../../lib/competitions/reward-ledger.js";
import { buildCompetitionRewardPlan } from "../../../../lib/competitions/reward-plans.js";
import { json, methodNotAllowed, unauthorized } from "../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../lib/validation.js";

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

async function resolvedPlan(context, competitionIdValue) {
  const first = await buildCompetitionRewardPlan(context.env.COMPETITIONS_DB, competitionIdValue);
  if (first.ready) return first;
  const guildIds = [...new Set(first.dependencies
    .filter((dependency) => dependency.dependency === "guild_members" && dependency.guildId)
    .map((dependency) => dependency.guildId))];
  const guildMembersByGuildId = {};
  for (const guildId of guildIds) {
    const members = await competitionGuildMembers(context.env, guildId);
    if (!members) throw new Error(`Guild ${guildId} is unavailable from the competition bridge`);
    guildMembersByGuildId[guildId] = members;
  }
  return buildCompetitionRewardPlan(context.env.COMPETITIONS_DB, competitionIdValue, { guildMembersByGuildId });
}

function safePreview(plan) {
  return {
    ready: plan.ready,
    dependencies: plan.dependencies,
    deliveries: plan.deliveries.map((delivery) => ({
      rewardId: delivery.rewardId,
      submissionId: delivery.submissionId,
      recipientUuid: delivery.recipientUuid,
      operationKey: delivery.operationKey,
      state: delivery.state,
      rewardType: delivery.detail?.rewardType ?? null,
      publicLabel: delivery.detail?.publicLabel ?? null,
      publicDescription: delivery.detail?.publicDescription ?? null,
      amount: delivery.detail?.amount ?? null,
      splitTotal: delivery.detail?.splitTotal ?? null,
      manual: Boolean(delivery.detail?.manual),
      skippedReason: delivery.detail?.skippedReason ?? null
    }))
  };
}

export async function onRequestGet(context) {
  const id = competitionId(context);
  if (!id) return json({ error: "competition_not_found" }, 404);
  const authorized = await authorizeManager(context);
  if (authorized.response) return authorized.response;
  try {
    const competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
    if (!competition) return json({ error: "competition_not_found" }, 404);
    const deliveries = await listCompetitionRewardDeliveries(context.env.COMPETITIONS_DB, id);
    let plan = null;
    let planningError = null;
    if (["COMPLETED", "ARCHIVED"].includes(competition.lifecycleState)) {
      try {
        plan = safePreview(await resolvedPlan(context, id));
      } catch (error) {
        planningError = String(error?.message ?? error);
      }
    }
    return json({
      competition: {
        id,
        title: competition.title,
        lifecycleState: competition.lifecycleState,
        configVersion: competition.configVersion
      },
      plan,
      planningError,
      deliveries
    });
  } catch {
    return json({ error: "competition_rewards_unavailable" }, 503);
  }
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
  if (input?.action !== "CONFIRM_PLAN") return json({ error: "invalid_reward_action" }, 400);

  try {
    const competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
    if (!competition) return json({ error: "competition_not_found" }, 404);
    if (competition.lifecycleState !== "COMPLETED") {
      return json({ error: "rewards_require_published_results", lifecycleState: competition.lifecycleState }, 409);
    }

    const plan = await resolvedPlan(context, id);
    if (!plan.ready) return json({ error: "reward_plan_not_ready", dependencies: plan.dependencies }, 409);
    const createdAt = new Date().toISOString();
    const insertion = await insertRewardDeliveries(context.env.COMPETITIONS_DB, plan.deliveries, createdAt);
    const deliveries = await listCompetitionRewardDeliveries(context.env.COMPETITIONS_DB, id);
    return json({
      status: "CONFIRMED",
      requested: insertion.requested,
      inserted: insertion.inserted,
      duplicateProtected: insertion.requested - insertion.inserted,
      preview: safePreview(plan),
      deliveries
    });
  } catch (error) {
    return json({ error: "reward_plan_confirmation_failed", detail: String(error?.message ?? error) }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET", "POST"]);
}

export { competitionId, resolvedPlan, safePreview };
