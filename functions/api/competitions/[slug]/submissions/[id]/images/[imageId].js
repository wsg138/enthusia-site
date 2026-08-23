import {
  competitionsEnabled,
  hasCompetitionDatabase,
  hasCompetitionMedia
} from "../../../../../../lib/competitions/access.js";
import { deleteCompetitionImage } from "../../../../../../lib/competitions/media-storage.js";
import { getCompetitionParticipantSession } from "../../../../../../lib/competitions/participant-auth.js";
import { authorizeCompetitionRead } from "../../../../../../lib/competitions/public-access.js";
import { getPublicCompetitionBySlug } from "../../../../../../lib/competitions/repository.js";
import {
  getOwnedSubmissionImage,
  removeSubmissionImage
} from "../../../../../../lib/competitions/submission-media.js";
import { getAccountSubmission } from "../../../../../../lib/competitions/submissions.js";
import { json, methodNotAllowed, unauthorized } from "../../../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../../../lib/validation.js";

function paramUuid(context, key) {
  const value = typeof context?.params?.[key] === "string" ? context.params[key].trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
}

function slugValue(context) {
  const value = typeof context?.params?.slug === "string" ? context.params.slug.trim().toLowerCase() : "";
  return /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(value) ? value : null;
}

function expectedRevision(request) {
  const value = Number(request.headers.get("x-submission-revision"));
  return Number.isInteger(value) && value >= 1 ? value : null;
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
  const submissionId = paramUuid(context, "id");
  const imageId = paramUuid(context, "imageId");
  if (!slug || !submissionId || !imageId) return { response: json({ error: "image_not_found" }, 404) };
  try {
    const competition = await getPublicCompetitionBySlug(context.env.COMPETITIONS_DB, slug);
    if (!competition) return { response: json({ error: "competition_not_found" }, 404) };
    const submission = await getAccountSubmission(
      context.env.COMPETITIONS_DB,
      competition.id,
      submissionId,
      session.subject
    );
    if (!submission) return { response: json({ error: "image_not_found" }, 404) };
    const image = await getOwnedSubmissionImage(
      context.env.COMPETITIONS_DB,
      competition.id,
      submissionId,
      imageId,
      session.subject
    );
    if (!image || image.removedAt) return { response: json({ error: "image_not_found" }, 404) };
    return { session, competition, submission, image };
  } catch {
    return { response: json({ error: "competition_media_unavailable" }, 503) };
  }
}

function editable(competition, submission) {
  if (competition.lifecycleState === "SUBMISSIONS_OPEN" && submission.status === "DRAFT") return true;
  if (competition.lifecycleState !== "REVIEW" || submission.status !== "NEEDS_CHANGES") return false;
  const close = Date.parse(competition.config?.schedule?.reviewCloseAt ?? "");
  return Number.isFinite(close) && Date.now() <= close;
}

export async function onRequestGet(context) {
  const resolved = await resolveOwner(context);
  if (resolved.response) return resolved.response;
  try {
    const object = await context.env.COMPETITIONS_MEDIA.get(resolved.image.storageKey);
    if (!object?.body) return json({ error: "image_not_found" }, 404);
    const headers = new Headers({
      "content-type": resolved.image.mimeType,
      "cache-control": "private, no-store",
      "content-disposition": "inline",
      "x-content-type-options": "nosniff"
    });
    if (object.httpEtag) headers.set("etag", object.httpEtag);
    return new Response(object.body, { status: 200, headers });
  } catch {
    return json({ error: "competition_media_unavailable" }, 503);
  }
}

export async function onRequestDelete(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const revision = expectedRevision(context.request);
  if (!revision) return json({ error: "expected_revision_required" }, 400);
  const resolved = await resolveOwner(context);
  if (resolved.response) return resolved.response;
  if (!editable(resolved.competition, resolved.submission)) return json({ error: "submission_locked" }, 409);
  if (resolved.submission.revision !== revision) return json({ error: "submission_revision_conflict" }, 409);

  const removedAt = new Date().toISOString();
  try {
    const result = await removeSubmissionImage(context.env.COMPETITIONS_DB, {
      competitionId: resolved.competition.id,
      submissionId: resolved.submission.id,
      imageId: resolved.image.id,
      ownerSubject: resolved.session.subject,
      actorUuid: resolved.submission.ownerUuid,
      expectedRevision: revision,
      removedAt,
      auditEventId: crypto.randomUUID()
    });
    if (result.status !== "UPDATED") return json({ error: "submission_revision_conflict" }, 409);
    await deleteCompetitionImage(context.env.COMPETITIONS_MEDIA, resolved.image.storageKey).catch(() => {});
    return json({ status: "REMOVED", revision: result.revision });
  } catch {
    return json({ error: "submission_image_remove_failed" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET", "DELETE"]);
}

export { editable, expectedRevision, paramUuid, slugValue };
