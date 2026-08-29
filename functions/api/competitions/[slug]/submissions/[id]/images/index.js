import {
  competitionsEnabled,
  hasCompetitionDatabase,
  hasCompetitionMedia
} from "../../../../../../lib/competitions/access.js";
import { competitionImageLimits } from "../../../../../../lib/competitions/media-policy.js";
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
  nextSubmissionImageSortOrder
} from "../../../../../../lib/competitions/submission-media.js";
import {
  getAccountSubmission,
  listSubmissionImages
} from "../../../../../../lib/competitions/submissions.js";
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

async function resolveOwner(context) {
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
  const read = await authorizeCompetitionRead(context);
  if (read.response) return { response: read.response };
  if (!hasCompetitionDatabase(context.env) || !hasCompetitionMedia(context.env)) {
    return { response: json({ error: "competition_media_unavailable" }, 503) };
  }
  let session;
  try {
    session = await getCompetitionParticipantSession(context.request, context.env.COMPETITIONS_DB);
  } catch {
    return { response: json({ error: "competition_identity_unavailable" }, 503) };
  }
  if (!session) return { response: unauthorized() };
  const slug = slugValue(context);
  const id = submissionId(context);
  if (!slug || !id) return { response: json({ error: "submission_not_found" }, 404) };
  try {
    const competition = await getPublicCompetitionBySlug(context.env.COMPETITIONS_DB, slug);
    if (!competition) return { response: json({ error: "competition_not_found" }, 404) };
    const submission = await getAccountSubmission(context.env.COMPETITIONS_DB, competition.id, id, session.subject);
    if (!submission) return { response: json({ error: "submission_not_found" }, 404) };
    return { session, competition, submission };
  } catch {
    return { response: json({ error: "submission_unavailable" }, 503) };
  }
}

function editable(competition, submission) {
  if (competition.lifecycleState === "SUBMISSIONS_OPEN" && submission.status === "DRAFT") return true;
  if (competition.lifecycleState !== "REVIEW" || submission.status !== "NEEDS_CHANGES") return false;
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

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const revision = expectedRevision(context.request);
  if (!revision) return json({ error: "expected_revision_required" }, 400);
  const resolved = await resolveOwner(context);
  if (resolved.response) return resolved.response;
  const { session, competition, submission } = resolved;
  if (!editable(competition, submission)) return json({ error: "submission_locked" }, 409);
  if (submission.revision !== revision) return json({ error: "submission_revision_conflict" }, 409);

  let sortOrder;
  try {
    const images = await listSubmissionImages(context.env.COMPETITIONS_DB, submission.id);
    sortOrder = nextSubmissionImageSortOrder(images);
  } catch {
    return json({ error: "submission_images_unavailable" }, 503);
  }

  try {
    const limited = await imageUploadRateLimit(context, session);
    if (limited) return limited;
  } catch {
    return json({ error: "rate_limit_unavailable" }, 503);
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
      competitionId: competition.id,
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
    const attached = await attachSubmissionImage(context.env.COMPETITIONS_DB, {
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
        previewUrl: `/api/competitions/${competition.slug}/submissions/${submission.id}/images/${imageId}`
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

export { editable, expectedRevision, imageUploadRateLimit, readLimitedBody, slugValue, submissionId };
