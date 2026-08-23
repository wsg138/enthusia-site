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
  if (!Number.isInteger(input?.expectedVersion) || input.expectedVersion < 1) {
    return json({ error: "expected_version_required" }, 400);
  }
  const rewards = sanitizeCompetitionRewards(input?.rewards);
  const note = changeNote(input?.changeNote);
  if (!rewards || !note) return json({ error: "invalid_reward_configuration" }, 400);

  let current;
  try {
    current = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
  } catch {
    return json({ error: "competition_database_unavailable" }, 503);
  }
  if (!current) return json({ error: "competition_not_found" }, 404);
  if (current.lifecycleState !== "DRAFT") return json({ error: "competition_rewards_locked" }, 409);
  if (current.configVersion !== input.expectedVersion) {
    return json({ error: "competition_version_conflict", currentVersion: current.configVersion }, 409);
  }

  const config = sanitizeCompetitionConfig({ ...current.config, rewards });
  if (!config) return json({ error: "invalid_reward_configuration" }, 400);

  const now = new Date().toISOString();
  try {
    const result = await saveDraftCompetition(context.env.COMPETITIONS_DB, {
      competitionId: id,
      expectedVersion: input.expectedVersion,
      operationId: crypto.randomUUID(),
      auditEventId: crypto.randomUUID(),
      title: current.title,
      category: current.category,
      visibility: current.visibility,
      beforeTitle: current.title,
      beforeCategory: current.category,
      beforeVisibility: current.visibility,
      config,
      actorSubject: authorized.session.subject,
      actorUuid: authorized.session.player.uuid,
      createdAt: now,
      changeNote: note
    });
    if (result.status !== "UPDATED") return json({ error: "competition_version_conflict" }, 409);
    return json({
      competitionId: id,
      lifecycleState: "DRAFT",
      configVersion: result.competition.configVersion,
      rewards,
      publishReadiness: validatePublishableCompetitionConfig(config)
    });
  } catch (error) {
    const message = String(error?.message ?? error);
    if (message.includes("stale_competition_config_version") || message.includes("UNIQUE constraint")) {
      return json({ error: "competition_version_conflict" }, 409);
    }
    return json({ error: "competition_rewards_update_failed" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET", "PATCH"]);
}

export { changeNote, competitionId };
