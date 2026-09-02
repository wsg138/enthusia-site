import { authenticateRequest } from "../../../../../../../lib/auth.js";
import {
  canModerateCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase,
  hasCompetitionMedia
} from "../../../../../../../lib/competitions/access.js";
import { getAdminCompetition } from "../../../../../../../lib/competitions/drafts.js";
import {
  cleanupStoredUpload,
  privateStoredImageResponse
} from "../../../../../../../lib/competitions/media-workflow.js";
import {
  getStaffSubmissionImage,
  removeStaffSubmissionImage
} from "../../../../../../../lib/competitions/staff-media.js";
import { getStaffSubmission } from "../../../../../../../lib/competitions/staff-submissions.js";
import { json, methodNotAllowed, unauthorized } from "../../../../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../../../../lib/validation.js";

const STAFF_REMOVAL_STATES = new Set(["SUBMISSIONS_OPEN", "REVIEW"]);

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
  return loadStaffMedia(context, session, { competitionId, submissionId, imageId });
}

async function loadStaffMedia(context, session, identity) {
  try {
    const [competition, submission, image] = await Promise.all([
      getAdminCompetition(context.env.COMPETITIONS_DB, identity.competitionId),
      getStaffSubmission(context.env.COMPETITIONS_DB, identity.competitionId, identity.submissionId),
      getStaffSubmissionImage(context.env.COMPETITIONS_DB, identity.competitionId, identity.submissionId, identity.imageId)
    ]);
    if (!competition || !submission || !image || image.removedAt) {
      return { response: json({ error: "image_not_found" }, 404) };
    }
    return { session, ...identity, competition, submission, image };
  } catch {
    return { response: json({ error: "competition_media_unavailable" }, 503) };
  }
}

export async function onRequestGet(context) {
  const authorized = await authorize(context);
  if (authorized.response) return authorized.response;
  const resolved = await resolve(context, authorized.session);
  if (resolved.response) return resolved.response;
  return privateStoredImageResponse(context.env.COMPETITIONS_MEDIA, resolved.image);
}

function validRemovalInput(input) {
  const expectedRevision = input?.expectedRevision;
  const privateNote = typeof input?.privateNote === "string" ? input.privateNote.trim() : "";
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) return null;
  if (!privateNote || privateNote.length > 4000) return null;
  return { expectedRevision, privateNote };
}

async function removalInput(request) {
  try {
    const input = validRemovalInput(await request.json());
    return input ? { input } : { response: json({ error: "invalid_image_removal" }, 400) };
  } catch {
    return { response: json({ error: "invalid_image_removal" }, 400) };
  }
}

function staffRemovalStateResponse(resolved, expectedRevision) {
  if (!STAFF_REMOVAL_STATES.has(resolved.competition.lifecycleState)) {
    return json({ error: "submission_locked" }, 409);
  }
  if (resolved.submission.revision !== expectedRevision) {
    return json({ error: "submission_revision_conflict" }, 409);
  }
  return null;
}

async function preflightStaffRemoval(context) {
  if (!requireSameOrigin(context.request)) return { response: json({ error: "invalid_origin" }, 403) };
  const authorized = await authorize(context);
  if (authorized.response) return authorized;
  const resolved = await resolve(context, authorized.session);
  if (resolved.response) return resolved;
  const parsed = await removalInput(context.request);
  if (parsed.response) return parsed;
  const stateResponse = staffRemovalStateResponse(resolved, parsed.input.expectedRevision);
  return stateResponse
    ? { response: stateResponse }
    : { ...authorized, ...resolved, ...parsed.input };
}

async function persistStaffRemoval(context, removal) {
  try {
    const result = await removeStaffSubmissionImage(context.env.COMPETITIONS_DB, {
      competitionId: removal.competitionId,
      submissionId: removal.submissionId,
      imageId: removal.imageId,
      expectedRevision: removal.expectedRevision,
      expectedConfigVersion: removal.competition.configVersion,
      actorSubject: removal.session.subject,
      removedByUuid: removal.session.player.uuid,
      privateNote: removal.privateNote,
      removedAt: new Date().toISOString(),
      auditEventId: crypto.randomUUID()
    });
    if (result.status !== "UPDATED") return json({ error: "submission_revision_conflict" }, 409);
    await cleanupStoredUpload(context.env.COMPETITIONS_MEDIA, removal.image.storageKey);
    return json({ status: "REMOVED", revision: result.revision });
  } catch {
    return json({ error: "submission_image_remove_failed" }, 503);
  }
}

export async function onRequestDelete(context) {
  const removal = await preflightStaffRemoval(context);
  if (removal.response) return removal.response;
  return persistStaffRemoval(context, removal);
}

export function onRequest() {
  return methodNotAllowed(["GET", "DELETE"]);
}

export { paramUuid };
