import {
  competitionsEnabled,
  hasCompetitionDatabase,
  hasCompetitionMedia
} from "../../../../../../lib/competitions/access.js";
import { competitionImageLimits } from "../../../../../../lib/competitions/media-policy.js";
import { readLimitedBody, requestMimeType } from "../../../../../../lib/competitions/media-upload.js";
import {
  deleteCompetitionImage,
  prepareCompetitionImage,
  storePreparedCompetitionImage
} from "../../../../../../lib/competitions/media-storage.js";
import { getCompetitionParticipantSession } from "../../../../../../lib/competitions/participant-auth.js";
import { authorizeCompetitionRead } from "../../../../../../lib/competitions/public-access.js";
import { competitionRateLimit, rateLimitHeaders } from "../../../../../../lib/competitions/rate-limit.js";
import { getPublicCompetitionBySlug } from "../../../../../../lib/competitions/repository.js";
import {
  attachSubmissionImage,
  nextStoredSubmissionImageSortOrder
} from "../../../../../../lib/competitions/submission-media.js";
import { getAccountSubmission } from "../../../../../../lib/competitions/submissions.js";
import { json, methodNotAllowed, unauthorized } from "../../../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../../../lib/validation.js";

function slugValue(context) {
  const value = typeof context?.params?.slug === "string" ? context.params.slug.trim().toLowerCase() : "";
  return /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(value) ? value : null;
}

function submissionId(context) {
  const value = typeof context?.params?.id === "string" ? context.params.id.trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
}

function expectedRevision(request) {
  const value = Number(request.headers.get("x-submission-revision"));
  return Number.isInteger(value) && value >= 1 ? value : null;
}

async function participantSession(context) {
  try {
    const session = await getCompetitionParticipantSession(context.request, context.env.COMPETITIONS_DB);
    return session ? { session } : { response: unauthorized() };
  } catch {
    return { response: json({ error: "competition_identity_unavailable" }, 503) };
  }
}

async function loadOwnedSubmission(context, session, slug, id) {
  try {
    const database = context.env.COMPETITIONS_DB;
    const competition = await getPublicCompetitionBySlug(database, slug);
    if (!competition) return { response: json({ error: "competition_not_found" }, 404) };
    const submission = await getAccountSubmission(database, competition.id, id, session.subject);
    return submission
      ? { session, competition, submission }
      : { response: json({ error: "submission_not_found" }, 404) };
  } catch {
    return { response: json({ error: "submission_unavailable" }, 503) };
  }
}

async function resolveOwner(context) {
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
  const read = await authorizeCompetitionRead(context);
  if (read.response) return { response: read.response };
  if (!hasCompetitionDatabase(context.env) || !hasCompetitionMedia(context.env)) {
    return { response: json({ error: "competition_media_unavailable" }, 503) };
  }
  const identified = await participantSession(context);
  if (identified.response) return identified;
  const slug = slugValue(context);
  const id = submissionId(context);
  if (!slug || !id) return { response: json({ error: "submission_not_found" }, 404) };
  return loadOwnedSubmission(context, identified.session, slug, id);
}

function editable(competition, submission) {
  const openDraft = competition.lifecycleState === "SUBMISSIONS_OPEN" && submission.status === "DRAFT";
  const reviewChanges = competition.lifecycleState === "REVIEW" && submission.status === "NEEDS_CHANGES";
  if (openDraft) return true;
  if (!reviewChanges) return false;
  return withinReviewWindow(competition);
}

function withinReviewWindow(competition) {
  const close = Date.parse(competition.config?.schedule?.reviewCloseAt ?? "");
  return Number.isFinite(close) && Date.now() <= close;
}

async function imageUploadRateLimit(context, session) {
  const result = await competitionRateLimit(context.env.COMPETITIONS_DB, {
    scope: "image-upload",
    identity: session.subject,
    limit: 12,
    windowSeconds: 600
  });
  return result.allowed
    ? null
    : json({ error: "rate_limited", retryAfterSeconds: result.retryAfterSeconds }, 429, rateLimitHeaders(result));
}

async function uploadSortOrder(database, id) {
  try {
    return { sortOrder: await nextStoredSubmissionImageSortOrder(database, id) };
  } catch {
    return { response: json({ error: "submission_images_unavailable" }, 503) };
  }
}

async function uploadRateLimit(context, session) {
  try {
    const response = await imageUploadRateLimit(context, session);
    return response ? { response } : {};
  } catch {
    return { response: json({ error: "rate_limit_unavailable" }, 503) };
  }
}

async function preflightUpload(context) {
  if (!requireSameOrigin(context.request)) return { response: json({ error: "invalid_origin" }, 403) };
  const revision = expectedRevision(context.request);
  if (!revision) return { response: json({ error: "expected_revision_required" }, 400) };
  const resolved = await resolveOwner(context);
  if (resolved.response) return resolved;
  if (!editable(resolved.competition, resolved.submission)) {
    return { response: json({ error: "submission_locked" }, 409) };
  }
  if (resolved.submission.revision !== revision) {
    return { response: json({ error: "submission_revision_conflict" }, 409) };
  }
  const order = await uploadSortOrder(context.env.COMPETITIONS_DB, resolved.submission.id);
  if (order.response) return order;
  const rateLimit = await uploadRateLimit(context, resolved.session);
  return rateLimit.response ? rateLimit : { ...resolved, ...order, revision };
}

function imageBodyFailureResponse(error) {
  const code = String(error?.message ?? "invalid_image");
  return json({ error: code }, code === "image_too_large" ? 413 : 400);
}

function preparedImageFailureResponse(prepared) {
  if (prepared.status === "REJECTED") return json({ error: prepared.error || "invalid_image" }, 400);
  if (prepared.status === "BLOCKED") return json({ error: "image_blocked_by_moderation" }, 422);
  if (prepared.status !== "READY") return json({ error: "image_moderation_unavailable" }, 503);
  return null;
}

async function prepareUpload(context, competition) {
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
  const imageId = crypto.randomUUID();
  let prepared;
  try {
    prepared = await prepareCompetitionImage({
      data,
      competitionId: competition.id,
      mediaId: imageId,
      purpose: "submission",
      env: context.env
    });
  } catch {
    return { response: json({ error: "image_processing_failed" }, 400) };
  }
  const response = preparedImageFailureResponse(prepared);
  return response ? { response } : { imageId, prepared };
}

async function storeUpload(bucket, prepared) {
  try {
    return { stored: await storePreparedCompetitionImage(bucket, prepared) };
  } catch {
    return { response: json({ error: "competition_media_storage_failed" }, 503) };
  }
}

async function cleanupStoredImage(bucket, key) {
  try {
    await deleteCompetitionImage(bucket, key);
  } catch {
    // A failed best-effort cleanup must not replace the database error response.
  }
}

function attachmentRecord(request, uploaded) {
  const { competition, submission, session, revision, sortOrder } = request;
  const { imageId, stored } = uploaded;
  return {
    id: imageId,
    competitionId: competition.id,
    submissionId: submission.id,
    ownerSubject: session.subject,
    actorUuid: submission.ownerUuid,
    expectedRevision: revision,
    expectedConfigVersion: competition.configVersion,
    reviewCloseAt: competition.config?.schedule?.reviewCloseAt ?? null,
    sortOrder,
    storageKey: stored.key,
    sha256: stored.sha256,
    mimeType: stored.mimeType,
    byteSize: stored.size,
    width: stored.width,
    height: stored.height,
    moderation: stored.moderation,
    moderationCheckId: crypto.randomUUID(),
    auditEventId: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };
}

function uploadedImageResponse(request, uploaded, revision) {
  return json({
    image: {
      id: uploaded.imageId,
      sortOrder: request.sortOrder,
      mimeType: uploaded.stored.mimeType,
      byteSize: uploaded.stored.size,
      width: uploaded.stored.width,
      height: uploaded.stored.height,
      moderationState: "PASSED",
      previewUrl: `/api/competitions/${request.competition.slug}/submissions/${request.submission.id}/images/${uploaded.imageId}`
    },
    revision
  }, 201);
}

async function persistUpload(context, request, uploaded) {
  try {
    const attached = await attachSubmissionImage(
      context.env.COMPETITIONS_DB,
      attachmentRecord(request, uploaded)
    );
    if (attached.status !== "UPDATED") {
      await cleanupStoredImage(context.env.COMPETITIONS_MEDIA, uploaded.stored.key);
      return json({ error: "submission_revision_conflict" }, 409);
    }
    return uploadedImageResponse(request, uploaded, attached.revision);
  } catch {
    await cleanupStoredImage(context.env.COMPETITIONS_MEDIA, uploaded.stored.key);
    return json({ error: "submission_image_record_failed" }, 503);
  }
}

export async function onRequestPost(context) {
  const request = await preflightUpload(context);
  if (request.response) return request.response;
  const prepared = await prepareUpload(context, request.competition);
  if (prepared.response) return prepared.response;
  const storage = await storeUpload(context.env.COMPETITIONS_MEDIA, prepared.prepared);
  if (storage.response) return storage.response;
  return persistUpload(context, request, { ...prepared, ...storage });
}

export function onRequest() {
  return methodNotAllowed(["POST"]);
}

export {
  editable,
  expectedRevision,
  imageBodyFailureResponse,
  imageUploadRateLimit,
  preparedImageFailureResponse,
  readLimitedBody,
  slugValue,
  submissionId
};
