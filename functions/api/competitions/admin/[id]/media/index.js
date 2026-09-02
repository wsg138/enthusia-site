import { authenticateRequest } from "../../../../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase,
  hasCompetitionMedia
} from "../../../../../lib/competitions/access.js";
import { getAdminCompetition } from "../../../../../lib/competitions/drafts.js";
import { competitionImageLimits } from "../../../../../lib/competitions/media-policy.js";
import { readLimitedBody, requestMimeType } from "../../../../../lib/competitions/media-upload.js";
import { createAndAttachCompetitionAppearanceMedia } from "../../../../../lib/competitions/media-repository.js";
import {
  cleanupStoredUpload,
  imageBodyFailureResponse,
  preparedImageFailureResponse,
  storePreparedUpload
} from "../../../../../lib/competitions/media-workflow.js";
import { prepareCompetitionImage } from "../../../../../lib/competitions/media-storage.js";
import { json, methodNotAllowed, unauthorized } from "../../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../../lib/validation.js";

const APPEARANCE_PURPOSES = Object.freeze({
  banner: Object.freeze({ database: "BANNER", storage: "banner", field: "bannerImageId" }),
  icon: Object.freeze({ database: "ICON", storage: "icon", field: "iconImageId" }),
  category: Object.freeze({ database: "CATEGORY", storage: "category", field: "categoryImageId" })
});

function competitionId(context) {
  const value = typeof context?.params?.id === "string" ? context.params.id.trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
}

function appearancePurpose(request) {
  const value = String(request.headers.get("x-competition-media-purpose") ?? "banner").trim().toLowerCase();
  return APPEARANCE_PURPOSES[value] ?? null;
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

function expectedVersion(request) {
  const value = Number(request.headers.get("x-competition-version"));
  return Number.isInteger(value) && value >= 1 ? value : null;
}

export async function onRequestPost(context) {
  const request = await preflightUpload(context);
  if (request.response) return request.response;
  const prepared = await prepareUpload(context, request.id, request.purpose);
  if (prepared.response) return prepared.response;
  const stored = await storePreparedUpload(context.env.COMPETITIONS_MEDIA, prepared.prepared);
  if (stored.response) return stored.response;
  return persistUpload(context, request, { ...prepared, ...stored });
}

function uploadIdentity(context) {
  const id = competitionId(context);
  if (!id) return { response: json({ error: "competition_not_found" }, 404) };
  const version = expectedVersion(context.request);
  if (!version) return { response: json({ error: "expected_version_required" }, 400) };
  const purpose = appearancePurpose(context.request);
  return purpose
    ? { id, version, purpose }
    : { response: json({ error: "invalid_competition_media_purpose" }, 400) };
}

async function loadCompetition(context, id) {
  try {
    const competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
    return competition
      ? { competition }
      : { response: json({ error: "competition_not_found" }, 404) };
  } catch {
    return { response: json({ error: "competition_database_unavailable" }, 503) };
  }
}

function draftStateResponse(competition, version) {
  if (competition.lifecycleState !== "DRAFT") {
    return json({ error: "competition_media_locked" }, 409);
  }
  if (competition.configVersion !== version) {
    return json({ error: "competition_version_conflict", currentVersion: competition.configVersion }, 409);
  }
  return null;
}

async function preflightUpload(context) {
  if (!requireSameOrigin(context.request)) return { response: json({ error: "invalid_origin" }, 403) };
  const identity = uploadIdentity(context);
  if (identity.response) return identity;
  const authorized = await authorizeManager(context);
  if (authorized.response) return authorized;
  const loaded = await loadCompetition(context, identity.id);
  if (loaded.response) return loaded;
  const stateResponse = draftStateResponse(loaded.competition, identity.version);
  return stateResponse
    ? { response: stateResponse }
    : { ...identity, ...authorized, ...loaded };
}

async function prepareUpload(context, id, purpose) {
  const limits = competitionImageLimits();
  if (!limits.mimeTypes.includes(requestMimeType(context.request))) {
    return { response: json({ error: "unsupported_image_type" }, 415) };
  }
  let data;
  try {
    data = await readLimitedBody(context.request, limits.maxBytes);
  } catch (error) {
    return { response: imageBodyFailureResponse(error) };
  }
  const mediaId = crypto.randomUUID();
  let prepared;
  try {
    prepared = await prepareCompetitionImage({
      data,
      competitionId: id,
      mediaId,
      purpose: purpose.storage,
      env: context.env
    });
  } catch {
    return { response: json({ error: "image_processing_failed" }, 400) };
  }
  const response = preparedImageFailureResponse(prepared);
  return response ? { response } : { mediaId, prepared };
}

function updatedAppearanceConfig(competition, purpose, mediaId) {
  const config = structuredClone(competition.config);
  config.appearance = {
    ...(config.appearance ?? {}),
    [purpose.field]: mediaId
  };
  return config;
}

function appearanceRecord(request, uploaded) {
  return {
    id: uploaded.mediaId,
    competitionId: request.id,
    purpose: request.purpose.database,
    expectedVersion: request.version,
    storageKey: uploaded.stored.key,
    sha256: uploaded.stored.sha256,
    mimeType: uploaded.stored.mimeType,
    byteSize: uploaded.stored.size,
    width: uploaded.stored.width,
    height: uploaded.stored.height,
    moderation: uploaded.stored.moderation,
    config: updatedAppearanceConfig(request.competition, request.purpose, uploaded.mediaId),
    actorSubject: request.session.subject,
    actorUuid: request.session.player.uuid,
    createdAt: new Date().toISOString(),
    operationId: crypto.randomUUID(),
    auditEventId: crypto.randomUUID()
  };
}

function appearanceResponse(request, attached) {
  return json({
    media: {
      id: attached.media.id,
      purpose: attached.media.purpose,
      appearanceField: attached.appearanceField,
      mimeType: attached.media.mimeType,
      byteSize: attached.media.byteSize,
      width: attached.media.width,
      height: attached.media.height,
      sha256: attached.media.sha256,
      previewUrl: `/api/competitions/admin/${request.id}/media/${attached.media.id}`
    },
    configVersion: attached.configVersion
  }, 201);
}

function versionConflictError(error) {
  const message = String(error?.message ?? error);
  return message.includes("stale_competition_config_version") || message.includes("UNIQUE constraint");
}

async function persistUpload(context, request, uploaded) {
  try {
    const attached = await createAndAttachCompetitionAppearanceMedia(
      context.env.COMPETITIONS_DB,
      appearanceRecord(request, uploaded)
    );
    if (attached.status !== "UPDATED") {
      await cleanupStoredUpload(context.env.COMPETITIONS_MEDIA, uploaded.stored.key);
      return json({ error: "competition_version_conflict" }, 409);
    }
    return appearanceResponse(request, attached);
  } catch (error) {
    await cleanupStoredUpload(context.env.COMPETITIONS_MEDIA, uploaded.stored.key);
    if (versionConflictError(error)) {
      return json({ error: "competition_version_conflict" }, 409);
    }
    return json({ error: "competition_media_record_failed" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["POST"]);
}

export { appearancePurpose, expectedVersion };
