import { authenticateRequest } from "../../../../../../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase,
  hasCompetitionMedia
} from "../../../../../../../lib/competitions/access.js";
import { getAdminCompetition } from "../../../../../../../lib/competitions/drafts.js";
import { competitionImageLimits } from "../../../../../../../lib/competitions/media-policy.js";
import {
  deleteCompetitionImage,
  prepareCompetitionImage,
  storePreparedCompetitionImage
} from "../../../../../../../lib/competitions/media-storage.js";
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

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const authorized = await authorize(context);
  if (authorized.response) return authorized.response;
  const competitionId = paramUuid(context, "id");
  const submissionId = paramUuid(context, "submissionId");
  const revision = expectedRevision(context.request);
  if (!competitionId || !submissionId) return json({ error: "submission_not_found" }, 404);
  if (!revision) return json({ error: "expected_revision_required" }, 400);

  let competition;
  let submission;
  try {
    [competition, submission] = await Promise.all([
      getAdminCompetition(context.env.COMPETITIONS_DB, competitionId),
      getStaffSubmission(context.env.COMPETITIONS_DB, competitionId, submissionId)
    ]);
  } catch {
    return json({ error: "submission_unavailable" }, 503);
  }
  if (!competition || !submission) return json({ error: "submission_not_found" }, 404);
  if (!String(submission.ownerSubject ?? "").startsWith("staff-manual:")) {
    return json({ error: "manual_submission_required" }, 409);
  }
  if (!["SUBMISSIONS_OPEN", "REVIEW"].includes(competition.lifecycleState)
      || !["PENDING_REVIEW", "NEEDS_CHANGES"].includes(submission.status)) {
    return json({ error: "submission_locked" }, 409);
  }
  if (submission.revision !== revision) return json({ error: "submission_revision_conflict" }, 409);
  let sortOrder;
  try {
    sortOrder = await nextStoredSubmissionImageSortOrder(context.env.COMPETITIONS_DB, submissionId);
  } catch {
    return json({ error: "submission_images_unavailable" }, 503);
  }
  const requestedType = String(context.request.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
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
    return json({ error: "image_processing_failed" }, 400);
  }
  if (prepared.status === "REJECTED") return json({ error: prepared.error || "invalid_image" }, 400);
  if (prepared.status === "BLOCKED") return json({ error: "image_blocked_by_moderation" }, 422);
  if (prepared.status !== "READY") return json({ error: "image_moderation_unavailable" }, 503);

  let stored;
  try {
    stored = await storePreparedCompetitionImage(context.env.COMPETITIONS_MEDIA, prepared);
  } catch {
    return json({ error: "competition_media_storage_failed" }, 503);
  }

  const createdAt = new Date().toISOString();
  try {
    const attached = await attachStaffSubmissionImage(context.env.COMPETITIONS_DB, {
      id: imageId,
      competitionId,
      submissionId,
      actorSubject: authorized.session.subject,
      actorUuid: authorized.session.player.uuid,
      expectedRevision: revision,
      expectedConfigVersion: competition.configVersion,
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
      createdAt
    });
    if (attached.status !== "UPDATED") {
      await deleteCompetitionImage(context.env.COMPETITIONS_MEDIA, stored.key).catch(() => {});
      return json({ error: "submission_revision_conflict" }, 409);
    }
    return json({
      image: {
        id: imageId,
        sortOrder,
        mimeType: stored.mimeType,
        byteSize: stored.size,
        width: stored.width,
        height: stored.height,
        moderationState: "PASSED",
        previewUrl: `/api/competitions/admin/${competitionId}/submissions/${submissionId}/images/${imageId}`
      },
      revision: attached.revision
    }, 201);
  } catch {
    await deleteCompetitionImage(context.env.COMPETITIONS_MEDIA, stored.key).catch(() => {});
    return json({ error: "submission_image_record_failed" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["POST"]);
}

export { expectedRevision, paramUuid, readLimitedBody };
