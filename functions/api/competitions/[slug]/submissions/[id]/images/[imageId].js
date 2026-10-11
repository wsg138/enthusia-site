import {
  competitionsEnabled,
  hasCompetitionDatabase,
  hasCompetitionMedia
} from "../../../../../../lib/competitions/access.js";
import {
  cleanupStoredUpload,
  privateStoredImageResponse
} from "../../../../../../lib/competitions/media-workflow.js";
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

function ownerIdentity(context) {
  const slug = slugValue(context);
  const submissionId = paramUuid(context, "id");
  const imageId = paramUuid(context, "imageId");
  return slug && submissionId && imageId
    ? { slug, submissionId, imageId }
    : { response: json({ error: "image_not_found" }, 404) };
}

async function resolveOwner(context) {
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
  const read = await authorizeCompetitionRead(context);
  if (read.response) return { response: read.response };
  if (!hasCompetitionDatabase(context.env) || !hasCompetitionMedia(context.env)) {
    return { response: json({ error: "competition_media_unavailable" }, 503) };
  }
  const participant = await participantSession(context);
  if (participant.response) return participant;
  const identity = ownerIdentity(context);
  return identity.response
    ? identity
    : loadOwnerMedia(context, participant.session, identity);
}

async function participantSession(context) {
  try {
    const session = await getCompetitionParticipantSession(context.request, context.env.COMPETITIONS_DB);
    return session ? { session } : { response: unauthorized() };
  } catch {
    return { response: json({ error: "competition_identity_unavailable" }, 503) };
  }
}

async function loadOwnerMedia(context, session, identity) {
  try {
    const competition = await getPublicCompetitionBySlug(context.env.COMPETITIONS_DB, identity.slug);
    if (!competition) return { response: json({ error: "competition_not_found" }, 404) };
    const [submission, image] = await Promise.all([
      getAccountSubmission(context.env.COMPETITIONS_DB, competition.id, identity.submissionId, session.subject),
      getOwnedSubmissionImage(
        context.env.COMPETITIONS_DB,
        competition.id,
        identity.submissionId,
        identity.imageId,
        session.subject
      )
    ]);
    if (!submission) return { response: json({ error: "image_not_found" }, 404) };
    if (!image || image.removedAt) return { response: json({ error: "image_not_found" }, 404) };
    return { session, competition, submission, image };
  } catch {
    return { response: json({ error: "competition_media_unavailable" }, 503) };
  }
}

function editable(competition, submission) {
  if (competition.lifecycleState === "SUBMISSIONS_OPEN") return submission.status === "DRAFT";
  if (competition.lifecycleState !== "REVIEW") return false;
  if (submission.status !== "NEEDS_CHANGES") return false;
  const close = Date.parse(competition.config?.schedule?.reviewCloseAt ?? "");
  if (!Number.isFinite(close)) return false;
  return Date.now() <= close;
}

export async function onRequestGet(context) {
  const resolved = await resolveOwner(context);
  if (resolved.response) return resolved.response;
  return privateStoredImageResponse(context.env.COMPETITIONS_MEDIA, resolved.image);
}

async function preflightOwnerRemoval(context) {
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
  return { ...resolved, expectedRevision: revision };
}

async function persistOwnerRemoval(context, removal) {
  try {
    const result = await removeSubmissionImage(context.env.COMPETITIONS_DB, {
      competitionId: removal.competition.id,
      submissionId: removal.submission.id,
      imageId: removal.image.id,
      ownerSubject: removal.session.subject,
      actorUuid: removal.submission.ownerUuid,
      expectedRevision: removal.expectedRevision,
      expectedConfigVersion: removal.competition.configVersion,
      reviewCloseAt: removal.competition.config?.schedule?.reviewCloseAt ?? null,
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
  const removal = await preflightOwnerRemoval(context);
  if (removal.response) return removal.response;
  return persistOwnerRemoval(context, removal);
}

export function onRequest() {
  return methodNotAllowed(["GET", "DELETE"]);
}

export { editable, expectedRevision, paramUuid, slugValue };
