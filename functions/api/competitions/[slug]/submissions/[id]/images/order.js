import { authenticateRequest } from "../../../../../../lib/auth.js";
import { competitionsEnabled, hasCompetitionDatabase } from "../../../../../../lib/competitions/access.js";
import { reorderOwnedSubmissionImages } from "../../../../../../lib/competitions/submission-image-order.js";
import { authorizeCompetitionRead } from "../../../../../../lib/competitions/public-access.js";
import { getPublicCompetitionBySlug } from "../../../../../../lib/competitions/repository.js";
import { getAccountSubmission, listSubmissionImages } from "../../../../../../lib/competitions/submissions.js";
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

function editable(competition, submission) {
  if (competition.lifecycleState === "SUBMISSIONS_OPEN" && submission.status === "DRAFT") return true;
  if (competition.lifecycleState !== "REVIEW" || submission.status !== "NEEDS_CHANGES") return false;
  const close = Date.parse(competition.config?.schedule?.reviewCloseAt ?? "");
  return Number.isFinite(close) && Date.now() <= close;
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  if (!competitionsEnabled(context.env)) return json({ error: "not_found" }, 404);
  const read = await authorizeCompetitionRead(context);
  if (read.response) return read.response;
  if (!hasCompetitionDatabase(context.env)) return json({ error: "competition_database_unavailable" }, 503);

  let session;
  try {
    session = await authenticateRequest(context.request, context.env);
  } catch {
    return unauthorized();
  }
  const slug = slugValue(context);
  const id = submissionId(context);
  if (!slug || !id) return json({ error: "submission_not_found" }, 404);

  let input;
  try {
    input = await context.request.json();
  } catch {
    input = null;
  }
  if (
    !Number.isInteger(input?.expectedRevision)
    || input.expectedRevision < 1
    || !Array.isArray(input?.imageIds)
    || !isCanonicalUuid(String(input?.coverImageId ?? "").toLowerCase())
    || input.imageIds.some((imageId) => !isCanonicalUuid(String(imageId ?? "").toLowerCase()))
  ) return json({ error: "invalid_image_order" }, 400);

  try {
    const competition = await getPublicCompetitionBySlug(context.env.COMPETITIONS_DB, slug);
    if (!competition) return json({ error: "competition_not_found" }, 404);
    const submission = await getAccountSubmission(context.env.COMPETITIONS_DB, competition.id, id, session.subject);
    if (!submission) return json({ error: "submission_not_found" }, 404);
    if (!editable(competition, submission)) return json({ error: "submission_locked" }, 409);
    if (submission.revision !== input.expectedRevision) return json({ error: "submission_revision_conflict" }, 409);

    const current = await listSubmissionImages(context.env.COMPETITIONS_DB, submission.id);
    const currentIds = current.map((image) => image.id).sort();
    const requestedIds = input.imageIds.map((imageId) => String(imageId).toLowerCase());
    if (
      requestedIds.length !== currentIds.length
      || new Set(requestedIds).size !== requestedIds.length
      || requestedIds.slice().sort().some((value, index) => value !== currentIds[index])
    ) return json({ error: "image_order_must_include_all_images" }, 409);

    const result = await reorderOwnedSubmissionImages(context.env.COMPETITIONS_DB, {
      competitionId: competition.id,
      submissionId: submission.id,
      ownerSubject: session.subject,
      actorUuid: session.player.uuid,
      expectedRevision: input.expectedRevision,
      imageIds: requestedIds,
      coverImageId: String(input.coverImageId).toLowerCase(),
      updatedAt: new Date().toISOString(),
      auditEventId: crypto.randomUUID()
    });
    if (result.status !== "UPDATED") return json({ error: "submission_revision_conflict" }, 409);
    return json({ imageIds: requestedIds, coverImageId: String(input.coverImageId).toLowerCase(), revision: result.revision });
  } catch (error) {
    if (error instanceof TypeError) return json({ error: "invalid_image_order" }, 400);
    return json({ error: "submission_image_order_failed" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["POST"]);
}

export { editable, slugValue, submissionId };
