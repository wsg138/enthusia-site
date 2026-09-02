import { authenticateRequest } from "../../../../../../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase,
  hasCompetitionMedia
} from "../../../../../../../lib/competitions/access.js";
import { getAdminCompetition } from "../../../../../../../lib/competitions/drafts.js";
import { competitionImageLimits } from "../../../../../../../lib/competitions/media-policy.js";
import { readLimitedBody, requestMimeType } from "../../../../../../../lib/competitions/media-upload.js";
import {
  cleanupStoredUpload as cleanupStoredImage,
  imageBodyFailureResponse,
  preparedImageFailureResponse,
  storePreparedUpload as storeUpload
} from "../../../../../../../lib/competitions/media-workflow.js";
import { prepareCompetitionImage } from "../../../../../../../lib/competitions/media-storage.js";
import { nextStoredSubmissionImageSortOrder } from "../../../../../../../lib/competitions/submission-media.js";
import { attachStaffSubmissionImage } from "../../../../../../../lib/competitions/staff-media.js";
import { getStaffSubmission } from "../../../../../../../lib/competitions/staff-submissions.js";
import { json, methodNotAllowed, unauthorized } from "../../../../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../../../../lib/validation.js";

function paramUuid(context, key) {
  const value = typeof context?.params?.[key] === "string" ? context.params[key].trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
}

function expectedRevision(request) {
  const value = Number(request.headers.get("x-submission-revision"));
  return Number.isInteger(value) && value >= 1 ? value : null;
}

async function authorize(context) {
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
  if (!hasCompetitionDatabase(context.env) || !hasCompetitionMedia(context.env)) {
    return { response: json({ error: "competition_media_unavailable" }, 503) };
  }
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

function uploadIdentity(context) {
  const competitionId = paramUuid(context, "id");
  const submissionId = paramUuid(context, "submissionId");
  if (!competitionId || !submissionId) {
    return { response: json({ error: "submission_not_found" }, 404) };
  }
  const revision = expectedRevision(context.request);
  return revision
    ? { competitionId, submissionId, revision }
    : { response: json({ error: "expected_revision_required" }, 400) };
}

async function loadManualSubmission(context, identity) {
  try {
    const database = context.env.COMPETITIONS_DB;
    const [competition, submission] = await Promise.all([
      getAdminCompetition(database, identity.competitionId),
      getStaffSubmission(database, identity.competitionId, identity.submissionId)
    ]);
    return competition && submission
      ? { competition, submission }
      : { response: json({ error: "submission_not_found" }, 404) };
  } catch {
    return { response: json({ error: "submission_unavailable" }, 503) };
  }
}

function manualUploadStateResponse(competition, submission, revision) {
  if (!String(submission.ownerSubject ?? "").startsWith("staff-manual:")) {
    return json({ error: "manual_submission_required" }, 409);
  }
  const activeLifecycle = ["SUBMISSIONS_OPEN", "REVIEW"].includes(competition.lifecycleState);
  const editableStatus = ["PENDING_REVIEW", "NEEDS_CHANGES"].includes(submission.status);
  if (!activeLifecycle || !editableStatus) return json({ error: "submission_locked" }, 409);
  if (submission.revision !== revision) return json({ error: "submission_revision_conflict" }, 409);
  return null;
}

async function uploadSortOrder(database, submissionId) {
  try {
    return { sortOrder: await nextStoredSubmissionImageSortOrder(database, submissionId) };
  } catch {
    return { response: json({ error: "submission_images_unavailable" }, 503) };
  }
}

async function preflightUpload(context) {
  if (!requireSameOrigin(context.request)) return { response: json({ error: "invalid_origin" }, 403) };
  const authorized = await authorize(context);
  if (authorized.response) return authorized;
  const identity = uploadIdentity(context);
  if (identity.response) return identity;
  const loaded = await loadManualSubmission(context, identity);
  if (loaded.response) return loaded;
  const stateResponse = manualUploadStateResponse(loaded.competition, loaded.submission, identity.revision);
  if (stateResponse) return { response: stateResponse };
  const order = await uploadSortOrder(context.env.COMPETITIONS_DB, identity.submissionId);
  return order.response
    ? order
    : { ...authorized, ...identity, ...loaded, ...order };
}

async function prepareUpload(context, competitionId) {
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
      competitionId,
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

function attachmentRecord(request, uploaded) {
  return {
    id: uploaded.imageId,
    competitionId: request.competitionId,
    submissionId: request.submissionId,
    actorSubject: request.session.subject,
    actorUuid: request.session.player.uuid,
    expectedRevision: request.revision,
    expectedConfigVersion: request.competition.configVersion,
    sortOrder: request.sortOrder,
    storageKey: uploaded.stored.key,
    sha256: uploaded.stored.sha256,
    mimeType: uploaded.stored.mimeType,
    byteSize: uploaded.stored.size,
    width: uploaded.stored.width,
    height: uploaded.stored.height,
    moderation: uploaded.stored.moderation,
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
      previewUrl: `/api/competitions/admin/${request.competitionId}/submissions/${request.submissionId}/images/${uploaded.imageId}`
    },
    revision
  }, 201);
}

async function persistUpload(context, request, uploaded) {
  try {
    const attached = await attachStaffSubmissionImage(
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
  const prepared = await prepareUpload(context, request.competitionId);
  if (prepared.response) return prepared.response;
  const storage = await storeUpload(context.env.COMPETITIONS_MEDIA, prepared.prepared);
  if (storage.response) return storage.response;
  return persistUpload(context, request, { ...prepared, ...storage });
}

export function onRequest() {
  return methodNotAllowed(["POST"]);
}

export {
  expectedRevision,
  imageBodyFailureResponse,
  manualUploadStateResponse,
  paramUuid,
  preparedImageFailureResponse,
  readLimitedBody
};
