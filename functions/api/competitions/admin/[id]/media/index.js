import { authenticateRequest } from "../../../../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase,
  hasCompetitionMedia
} from "../../../../../lib/competitions/access.js";
import { getAdminCompetition } from "../../../../../lib/competitions/drafts.js";
import { competitionImageLimits } from "../../../../../lib/competitions/media-policy.js";
import { createAndAttachCompetitionBanner } from "../../../../../lib/competitions/media-repository.js";
import {
  deleteCompetitionImage,
  prepareCompetitionImage,
  storePreparedCompetitionImage
} from "../../../../../lib/competitions/media-storage.js";
import { json, methodNotAllowed, unauthorized } from "../../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../../lib/validation.js";

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
  if (!hasCompetitionDatabase(context.env) || !hasCompetitionMedia(context.env)) {
    return { response: json({ error: "competition_media_unavailable" }, 503) };
  }
  return { session };
}

async function readLimitedBody(request, limit) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new Error("image_too_large");
  if (!request.body) throw new Error("image_empty");

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel("image_too_large").catch(() => {});
        throw new Error("image_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (!total) throw new Error("image_empty");
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function expectedVersion(request) {
  const value = Number(request.headers.get("x-competition-version"));
  return Number.isInteger(value) && value >= 1 ? value : null;
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const id = competitionId(context);
  if (!id) return json({ error: "competition_not_found" }, 404);

  const version = expectedVersion(context.request);
  if (!version) return json({ error: "expected_version_required" }, 400);

  const authorized = await authorizeManager(context);
  if (authorized.response) return authorized.response;

  let competition;
  try {
    competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
  } catch {
    return json({ error: "competition_database_unavailable" }, 503);
  }
  if (!competition) return json({ error: "competition_not_found" }, 404);
  if (competition.lifecycleState !== "DRAFT") {
    return json({ error: "competition_media_locked" }, 409);
  }
  if (competition.configVersion !== version) {
    return json({ error: "competition_version_conflict", currentVersion: competition.configVersion }, 409);
  }

  const requestedType = String(context.request.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!competitionImageLimits().mimeTypes.includes(requestedType)) {
    return json({ error: "unsupported_image_type" }, 415);
  }

  let data;
  try {
    data = await readLimitedBody(context.request, competitionImageLimits().maxBytes);
  } catch (error) {
    const code = String(error?.message ?? "invalid_image");
    return json({ error: code }, code === "image_too_large" ? 413 : 400);
  }

  const mediaId = crypto.randomUUID();
  let prepared;
  try {
    prepared = await prepareCompetitionImage({
      data,
      competitionId: id,
      mediaId,
      purpose: "banner",
      env: context.env
    });
  } catch {
    return json({ error: "image_processing_failed" }, 400);
  }

  if (prepared.status === "REJECTED") {
    return json({ error: prepared.error || "invalid_image" }, 400);
  }
  if (prepared.status === "BLOCKED") {
    return json({ error: "image_blocked_by_moderation" }, 422);
  }
  if (prepared.status !== "READY") {
    return json({ error: "image_moderation_unavailable" }, 503);
  }

  let stored;
  try {
    stored = await storePreparedCompetitionImage(context.env.COMPETITIONS_MEDIA, prepared);
  } catch {
    return json({ error: "competition_media_storage_failed" }, 503);
  }

  const now = new Date().toISOString();
  const config = structuredClone(competition.config);
  config.appearance = {
    ...(config.appearance ?? {}),
    bannerImageId: mediaId
  };

  try {
    const attached = await createAndAttachCompetitionBanner(context.env.COMPETITIONS_DB, {
      id: mediaId,
      competitionId: id,
      expectedVersion: version,
      storageKey: stored.key,
      sha256: stored.sha256,
      mimeType: stored.mimeType,
      byteSize: stored.size,
      width: stored.width,
      height: stored.height,
      moderation: stored.moderation,
      config,
      actorSubject: authorized.session.subject,
      actorUuid: authorized.session.player.uuid,
      createdAt: now,
      operationId: crypto.randomUUID(),
      auditEventId: crypto.randomUUID()
    });

    if (attached.status !== "UPDATED") {
      await deleteCompetitionImage(context.env.COMPETITIONS_MEDIA, stored.key).catch(() => {});
      return json({ error: "competition_version_conflict" }, 409);
    }

    return json({
      media: {
        id: attached.media.id,
        purpose: attached.media.purpose,
        mimeType: attached.media.mimeType,
        byteSize: attached.media.byteSize,
        width: attached.media.width,
        height: attached.media.height,
        sha256: attached.media.sha256,
        previewUrl: `/api/competitions/admin/${id}/media/${attached.media.id}`
      },
      configVersion: attached.configVersion
    }, 201);
  } catch (error) {
    await deleteCompetitionImage(context.env.COMPETITIONS_MEDIA, stored.key).catch(() => {});
    const message = String(error?.message ?? error);
    if (message.includes("stale_competition_config_version") || message.includes("UNIQUE constraint")) {
      return json({ error: "competition_version_conflict" }, 409);
    }
    return json({ error: "competition_media_record_failed" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["POST"]);
}

export { expectedVersion, readLimitedBody };
