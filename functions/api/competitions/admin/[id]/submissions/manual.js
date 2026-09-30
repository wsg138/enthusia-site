import { authenticateRequest } from "../../../../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase
} from "../../../../../lib/competitions/access.js";
import { competitionPlayerLookup } from "../../../../../lib/competitions/bridge.js";
import { getAdminCompetition } from "../../../../../lib/competitions/drafts.js";
import { createManualSoloSubmission } from "../../../../../lib/competitions/manual-submissions.js";
import { sha256Hex } from "../../../../../lib/competitions/media-policy.js";
import { moderateText } from "../../../../../lib/competitions/moderation.js";
import { countPlayerEntrySlots } from "../../../../../lib/competitions/submissions.js";
import { json, methodNotAllowed, unauthorized } from "../../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../../lib/validation.js";

const encoder = new TextEncoder();

function competitionId(context) {
  const value = typeof context?.params?.id === "string" ? context.params.id.trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
}

function cleanTitle(value) {
  if (typeof value !== "string") return null;
  const title = value.trim().replace(/\s+/g, " ");
  return title.length >= 1 && title.length <= 100 ? title : null;
}

function cleanDescription(value, max) {
  if (typeof value !== "string") return null;
  const description = value.replace(/\r\n?/g, "\n").trim();
  return description.length >= 1 && description.length <= max ? description : null;
}

function isLocationObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasValidLocationValues(value, worldName) {
  return Boolean(worldName)
    && worldName.length <= 128
    && Number.isInteger(value.x)
    && Number.isInteger(value.y)
    && Number.isInteger(value.z)
    && value.exactCoordinatesConfirmed === true;
}

function cleanLocation(value, required) {
  if (!required && (value === null || value === undefined)) return null;
  if (!isLocationObject(value)) return undefined;
  const worldName = typeof value.worldName === "string" ? value.worldName.trim() : "";
  if (!hasValidLocationValues(value, worldName)) return undefined;
  return { worldName, x: value.x, y: value.y, z: value.z };
}

function cleanMinecraftName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return /^[A-Za-z0-9_]{1,16}$/.test(name) ? name : null;
}

function requestScope(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  if (!competitionsEnabled(context.env)) return json({ error: "not_found" }, 404);
  if (!hasCompetitionDatabase(context.env)) return json({ error: "competition_database_unavailable" }, 503);
  const id = competitionId(context);
  if (!id) return json({ error: "competition_not_found" }, 404);
  return { id };
}

async function managerSession(context) {
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

async function readInput(request) {
  let input;
  try {
    input = await request.json();
  } catch {
    input = null;
  }
  return input;
}

function competitionStateResponse(competition) {
  if (!["SUBMISSIONS_OPEN", "REVIEW"].includes(competition.lifecycleState)) {
    return json({ error: "manual_submission_window_closed" }, 409);
  }
  return competition.config?.entries?.allowedTypes?.includes("SOLO")
    ? null
    : json({ error: "solo_entries_not_allowed" }, 409);
}

function manualInput(input, competition) {
  const source = input || {};
  const minecraftName = cleanMinecraftName(source.minecraftName);
  if (!minecraftName) {
    return { response: json({ error: "invalid_minecraft_name" }, 400) };
  }
  const title = cleanTitle(source.title);
  const description = cleanDescription(source.description, competition.config.entries.maxDescriptionChars);
  const location = cleanLocation(source.location, Boolean(competition.config.entries.coordinatesRequested));
  if (!title || !description || location === undefined) {
    return { response: json({ error: "invalid_manual_submission" }, 400) };
  }
  return { minecraftName, title, description, location };
}

async function eligiblePlayer(context, competition, id, minecraftName) {
  const target = await competitionPlayerLookup(context.env, minecraftName);
  if (!target) return { response: json({ error: "minecraft_player_not_found" }, 404) };
  const entryCount = await countPlayerEntrySlots(context.env.COMPETITIONS_DB, id, target.uuid);
  if (entryCount >= competition.config.entries.maxEntriesPerPlayer) {
    return { response: json({ error: "player_entry_limit_reached" }, 409) };
  }
  return { target };
}

async function moderationResult(title, description, env) {
  const [titleModeration, descriptionModeration, titleHash, descriptionHash] = await Promise.all([
    moderateText(title, env),
    moderateText(description, env),
    sha256Hex(encoder.encode(title)),
    sha256Hex(encoder.encode(description))
  ]);
  const checks = [
    { id: crypto.randomUUID(), targetType: "TITLE", ...titleModeration, contentHash: titleHash },
    { id: crypto.randomUUID(), targetType: "DESCRIPTION", ...descriptionModeration, contentHash: descriptionHash }
  ];
  if (checks.some((check) => check.outcome === "ERROR")) {
    return { response: json({ error: "moderation_unavailable" }, 503) };
  }
  if (checks.some((check) => check.outcome !== "PASSED")) {
    return { response: json({ error: "manual_submission_text_blocked" }, 422) };
  }
  return { checks };
}

function submissionRecord({ id, competition, fields, target, checks, session }) {
  const now = new Date().toISOString();
  return {
    id,
    competitionId: competition.id,
    competitionTitle: competition.title,
    competitionSlug: competition.slug,
    expectedConfigVersion: competition.configVersion,
    ownerSubject: `staff-manual:${target.uuid}`,
    ownerUuid: target.uuid,
    ownerName: target.name,
    title: fields.title,
    description: fields.description,
    location: fields.location,
    moderationChecks: checks,
    actorSubject: session.subject,
    actorUuid: session.player.uuid,
    auditEventId: crypto.randomUUID(),
    notificationId: crypto.randomUUID(),
    createdAt: now,
    note: `Staff created a manual entry for ${target.name}`
  };
}

function createdResponse(submission) {
  return json({
    status: "PENDING_REVIEW",
    submission: {
      id: submission.id,
      ownerUuid: submission.ownerUuid,
      ownerName: submission.ownerName,
      title: submission.title,
      staffManaged: true,
      revision: 1
    }
  }, 201);
}

async function persistSubmission(context, submission) {
  const result = await createManualSoloSubmission(context.env.COMPETITIONS_DB, submission);
  return result.status === "CREATED"
    ? createdResponse(submission)
    : json({ error: "manual_submission_conflict" }, 409);
}

async function createSubmission(context, id, session, input) {
  const competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
  if (!competition) return json({ error: "competition_not_found" }, 404);
  const stateResponse = competitionStateResponse(competition);
  if (stateResponse) return stateResponse;
  const fields = manualInput(input, competition);
  if (fields.response) return fields.response;
  const player = await eligiblePlayer(context, competition, id, fields.minecraftName);
  if (player.response) return player.response;
  const moderation = await moderationResult(fields.title, fields.description, context.env);
  if (moderation.response) return moderation.response;
  const submission = submissionRecord({
    id: crypto.randomUUID(),
    competition,
    fields,
    target: player.target,
    checks: moderation.checks,
    session
  });
  return persistSubmission(context, submission);
}

function failureResponse(error) {
  const message = String(error?.message ?? error);
  return message.includes("Competition bridge")
    ? json({ error: "competition_bridge_unavailable" }, 503)
    : json({ error: "manual_submission_failed" }, 503);
}

export async function onRequestPost(context) {
  const scope = requestScope(context);
  if (scope instanceof Response) return scope;
  const authorized = await managerSession(context);
  if (authorized.response) return authorized.response;
  const input = await readInput(context.request);

  try {
    return await createSubmission(context, scope.id, authorized.session, input);
  } catch (error) {
    return failureResponse(error);
  }
}

export function onRequest() {
  return methodNotAllowed(["POST"]);
}

export { cleanDescription, cleanLocation, cleanTitle, competitionId };
