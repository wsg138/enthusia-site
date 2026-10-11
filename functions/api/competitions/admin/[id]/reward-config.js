import { authenticateRequest } from "../../../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase
} from "../../../../lib/competitions/access.js";
import { sanitizeCompetitionConfig } from "../../../../lib/competitions/config.js";
import { getAdminCompetition, saveDraftCompetition } from "../../../../lib/competitions/drafts.js";
import { validatePublishableCompetitionConfig } from "../../../../lib/competitions/lifecycle.js";
import { sanitizeCompetitionRewards } from "../../../../lib/competitions/reward-config.js";
import { json, methodNotAllowed, unauthorized } from "../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../lib/validation.js";

function competitionId(context) {
  const value = typeof context?.params?.id === "string" ? context.params.id.trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
}

async function authorizeManager(context) {
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
  let session;
  try {
    session = await authenticateRequest(context.request, context.env);
  } catch {
    return { response: unauthorized() };
  }
  if (!canManageCompetitions(session, context.env)) {
    return { response: json({ error: "competition_manager_required" }, 403) };
  }
  if (!hasCompetitionDatabase(context.env)) {
    return { response: json({ error: "competition_database_unavailable" }, 503) };
  }
  return { session };
}

function changeNote(value) {
  if (value === null || value === undefined || value === "") return "Competition rewards updated";
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 500 ? normalized : null;
}

function rewardUpdate(value) {
  if (!Number.isInteger(value?.expectedVersion) || value.expectedVersion < 1) {
    return { response: json({ error: "expected_version_required" }, 400) };
  }
  const rewards = sanitizeCompetitionRewards(value.rewards);
  const note = changeNote(value.changeNote);
  if (!rewards || !note) {
    return { response: json({ error: "invalid_reward_configuration" }, 400) };
  }
  return { expectedVersion: value.expectedVersion, rewards, changeNote: note };
}

async function readRewardUpdate(request) {
  try {
    return rewardUpdate(await request.json());
  } catch {
    return { response: json({ error: "expected_version_required" }, 400) };
  }
}

async function validatedRewardRequest(context) {
  if (!requireSameOrigin(context.request)) return { response: json({ error: "invalid_origin" }, 403) };
  const id = competitionId(context);
  if (!id) return { response: json({ error: "competition_not_found" }, 404) };
  const authorized = await authorizeManager(context);
  if (authorized.response) return authorized;
  const update = await readRewardUpdate(context.request);
  if (update.response) return update;
  return { id, session: authorized.session, update };
}

async function loadCompetition(db, id) {
  try {
    const competition = await getAdminCompetition(db, id);
    return competition
      ? { competition }
      : { response: json({ error: "competition_not_found" }, 404) };
  } catch {
    return { response: json({ error: "competition_database_unavailable" }, 503) };
  }
}

function rewardStateResponse(current, expectedVersion) {
  if (current.lifecycleState !== "DRAFT") {
    return json({ error: "competition_rewards_locked" }, 409);
  }
  if (current.configVersion !== expectedVersion) {
    return json({ error: "competition_version_conflict", currentVersion: current.configVersion }, 409);
  }
  return null;
}

function draftRewardChange(request, current, config) {
  const createdAt = new Date().toISOString();
  return {
    competitionId: request.id,
    expectedVersion: request.update.expectedVersion,
    operationId: crypto.randomUUID(),
    auditEventId: crypto.randomUUID(),
    title: current.title,
    category: current.category,
    visibility: current.visibility,
    beforeTitle: current.title,
    beforeCategory: current.category,
    beforeVisibility: current.visibility,
    config,
    actorSubject: request.session.subject,
    actorUuid: request.session.player.uuid,
    createdAt,
    changeNote: request.update.changeNote
  };
}

async function applyRewardUpdate(db, request, current, config) {
  const result = await saveDraftCompetition(db, draftRewardChange(request, current, config));
  if (result.status !== "UPDATED") {
    return json({ error: "competition_version_conflict" }, 409);
  }
  return json({
    competitionId: request.id,
    lifecycleState: "DRAFT",
    configVersion: result.competition.configVersion,
    rewards: request.update.rewards,
    publishReadiness: validatePublishableCompetitionConfig(config)
  });
}

function rewardUpdateFailureResponse(error) {
  const message = String(error?.message ?? error);
  const conflict = message.includes("stale_competition_config_version")
    || message.includes("UNIQUE constraint");
  return conflict
    ? json({ error: "competition_version_conflict" }, 409)
    : json({ error: "competition_rewards_update_failed" }, 503);
}

export async function onRequestGet(context) {
  const id = competitionId(context);
  if (!id) return json({ error: "competition_not_found" }, 404);
  const authorized = await authorizeManager(context);
  if (authorized.response) return authorized.response;
  try {
    const competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
    if (!competition) return json({ error: "competition_not_found" }, 404);
    return json({
      competitionId: id,
      lifecycleState: competition.lifecycleState,
      configVersion: competition.configVersion,
      rewards: competition.config?.rewards ?? { definitions: [] }
    });
  } catch {
    return json({ error: "competition_rewards_unavailable" }, 503);
  }
}

export async function onRequestPatch(context) {
  const request = await validatedRewardRequest(context);
  if (request.response) return request.response;
  const database = context.env.COMPETITIONS_DB;
  const loaded = await loadCompetition(database, request.id);
  if (loaded.response) return loaded.response;
  const stateResponse = rewardStateResponse(loaded.competition, request.update.expectedVersion);
  if (stateResponse) return stateResponse;

  const config = sanitizeCompetitionConfig({
    ...loaded.competition.config,
    rewards: request.update.rewards
  });
  if (!config) return json({ error: "invalid_reward_configuration" }, 400);
  try {
    return await applyRewardUpdate(database, request, loaded.competition, config);
  } catch (error) {
    return rewardUpdateFailureResponse(error);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET", "PATCH"]);
}

export {
  changeNote,
  competitionId,
  rewardStateResponse,
  rewardUpdate,
  rewardUpdateFailureResponse
};
