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

function cleanLocation(value, required) {
  if (!required && (value === null || value === undefined)) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const worldName = typeof value.worldName === "string" ? value.worldName.trim() : "";
  if (
    !worldName || worldName.length > 128
    || !Number.isInteger(value.x)
    || !Number.isInteger(value.y)
    || !Number.isInteger(value.z)
    || value.exactCoordinatesConfirmed !== true
  ) return undefined;
  return { worldName, x: value.x, y: value.y, z: value.z };
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  if (!competitionsEnabled(context.env)) return json({ error: "not_found" }, 404);
  if (!hasCompetitionDatabase(context.env)) return json({ error: "competition_database_unavailable" }, 503);
  const id = competitionId(context);
  if (!id) return json({ error: "competition_not_found" }, 404);

  let session;
  try {
    session = await authenticateRequest(context.request, context.env);
  } catch {
    return unauthorized();
  }
  if (!canManageCompetitions(session, context.env)) {
    return json({ error: "competition_manager_required" }, 403);
  }

  let input;
  try {
    input = await context.request.json();
  } catch {
    input = null;
  }
  const minecraftName = typeof input?.minecraftName === "string" ? input.minecraftName.trim() : "";
  if (!/^[A-Za-z0-9_]{1,16}$/.test(minecraftName)) return json({ error: "invalid_minecraft_name" }, 400);

  try {
    const competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
    if (!competition) return json({ error: "competition_not_found" }, 404);
    if (!["SUBMISSIONS_OPEN", "REVIEW"].includes(competition.lifecycleState)) {
      return json({ error: "manual_submission_window_closed" }, 409);
    }
    if (!competition.config?.entries?.allowedTypes?.includes("SOLO")) {
      return json({ error: "solo_entries_not_allowed" }, 409);
    }

    const title = cleanTitle(input?.title);
    const description = cleanDescription(input?.description, competition.config.entries.maxDescriptionChars);
    const location = cleanLocation(input?.location, Boolean(competition.config.entries.coordinatesRequested));
    if (!title || !description || location === undefined) {
      return json({ error: "invalid_manual_submission" }, 400);
    }

    const target = await competitionPlayerLookup(context.env, minecraftName);
    if (!target) return json({ error: "minecraft_player_not_found" }, 404);
    const entryCount = await countPlayerEntrySlots(context.env.COMPETITIONS_DB, id, target.uuid);
    if (entryCount >= competition.config.entries.maxEntriesPerPlayer) {
      return json({ error: "player_entry_limit_reached" }, 409);
    }

    const [titleModeration, descriptionModeration, titleHash, descriptionHash] = await Promise.all([
      moderateText(title, context.env),
      moderateText(description, context.env),
      sha256Hex(encoder.encode(title)),
      sha256Hex(encoder.encode(description))
    ]);
    const moderationChecks = [
      { id: crypto.randomUUID(), targetType: "TITLE", ...titleModeration, contentHash: titleHash },
      { id: crypto.randomUUID(), targetType: "DESCRIPTION", ...descriptionModeration, contentHash: descriptionHash }
    ];
    if (moderationChecks.some((check) => check.outcome === "ERROR")) {
      return json({ error: "moderation_unavailable" }, 503);
    }
    if (moderationChecks.some((check) => check.outcome !== "PASSED")) {
      return json({ error: "manual_submission_text_blocked" }, 422);
    }

    const submissionId = crypto.randomUUID();
    const now = new Date().toISOString();
    await createManualSoloSubmission(context.env.COMPETITIONS_DB, {
      id: submissionId,
      competitionId: id,
      competitionTitle: competition.title,
      competitionSlug: competition.slug,
      ownerSubject: `staff-manual:${target.uuid}`,
      ownerUuid: target.uuid,
      ownerName: target.name,
      title,
      description,
      location,
      moderationChecks,
      actorSubject: session.subject,
      actorUuid: session.player.uuid,
      auditEventId: crypto.randomUUID(),
      notificationId: crypto.randomUUID(),
      createdAt: now,
      note: `Staff created a manual entry for ${target.name}`
    });
    return json({
      status: "PENDING_REVIEW",
      submission: {
        id: submissionId,
        ownerUuid: target.uuid,
        ownerName: target.name,
        title,
        staffManaged: true,
        revision: 1
      }
    }, 201);
  } catch (error) {
    const message = String(error?.message ?? error);
    if (message.includes("Competition bridge")) return json({ error: "competition_bridge_unavailable" }, 503);
    return json({ error: "manual_submission_failed" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["POST"]);
}

export { cleanDescription, cleanLocation, cleanTitle, competitionId };
