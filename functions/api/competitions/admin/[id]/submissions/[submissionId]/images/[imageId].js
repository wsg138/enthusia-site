import { authenticateRequest } from "../../../../../../../lib/auth.js";
import {
  canModerateCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase,
  hasCompetitionMedia
} from "../../../../../../../lib/competitions/access.js";
import { getAdminCompetition } from "../../../../../../../lib/competitions/drafts.js";
import { deleteCompetitionImage } from "../../../../../../../lib/competitions/media-storage.js";
import {
  getStaffSubmissionImage,
  removeStaffSubmissionImage
} from "../../../../../../../lib/competitions/staff-media.js";
import { getStaffSubmission } from "../../../../../../../lib/competitions/staff-submissions.js";
import { json, methodNotAllowed, unauthorized } from "../../../../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../../../../lib/validation.js";

function paramUuid(context, key) {
  const value = typeof context?.params?.[key] === "string" ? context.params[key].trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
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
  if (!canModerateCompetitions(session, context.env)) {
    return { response: json({ error: "competition_moderator_required" }, 403) };
  }
  return { session };
}

async function resolve(context, session) {
  const competitionId = paramUuid(context, "id");
  const submissionId = paramUuid(context, "submissionId");
  const imageId = paramUuid(context, "imageId");
  if (!competitionId || !submissionId || !imageId) return { response: json({ error: "image_not_found" }, 404) };
  try {
    const [competition, submission, image] = await Promise.all([
      getAdminCompetition(context.env.COMPETITIONS_DB, competitionId),
      getStaffSubmission(context.env.COMPETITIONS_DB, competitionId, submissionId),
      getStaffSubmissionImage(context.env.COMPETITIONS_DB, competitionId, submissionId, imageId)
    ]);
    if (!competition || !submission || !image || image.removedAt) {
      return { response: json({ error: "image_not_found" }, 404) };
    }
    return { session, competitionId, submissionId, imageId, competition, submission, image };
  } catch {
    return { response: json({ error: "competition_media_unavailable" }, 503) };
  }
}

export async function onRequestGet(context) {
  const authorized = await authorize(context);
  if (authorized.response) return authorized.response;
  const resolved = await resolve(context, authorized.session);
  if (resolved.response) return resolved.response;
  try {
    const object = await context.env.COMPETITIONS_MEDIA.get(resolved.image.storageKey);
    if (!object?.body) return json({ error: "image_not_found" }, 404);
    return new Response(object.body, {
      status: 200,
      headers: {
        "content-type": resolved.image.mimeType,
        "cache-control": "private, no-store",
        "content-disposition": "inline",
        "x-content-type-options": "nosniff"
      }
    });
  } catch {
    return json({ error: "competition_media_unavailable" }, 503);
  }
}

export async function onRequestDelete(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const authorized = await authorize(context);
  if (authorized.response) return authorized.response;
  const resolved = await resolve(context, authorized.session);
  if (resolved.response) return resolved.response;

  let input;
  try {
    input = await context.request.json();
  } catch {
    input = null;
  }
  const privateNote = typeof input?.privateNote === "string" ? input.privateNote.trim() : "";
  const expectedRevision = input?.expectedRevision;
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1 || !privateNote || privateNote.length > 4000) {
    return json({ error: "invalid_image_removal" }, 400);
  }
  if (!["SUBMISSIONS_OPEN", "REVIEW"].includes(resolved.competition.lifecycleState)) {
    return json({ error: "submission_locked" }, 409);
  }
  if (resolved.submission.revision !== expectedRevision) return json({ error: "submission_revision_conflict" }, 409);

  const removedAt = new Date().toISOString();
  try {
    const result = await removeStaffSubmissionImage(context.env.COMPETITIONS_DB, {
      competitionId: resolved.competitionId,
      submissionId: resolved.submissionId,
      imageId: resolved.imageId,
      expectedRevision,
      expectedConfigVersion: resolved.competition.configVersion,
      actorSubject: authorized.session.subject,
      removedByUuid: authorized.session.player.uuid,
      privateNote,
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

export { paramUuid };
