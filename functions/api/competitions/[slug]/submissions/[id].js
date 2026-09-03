import { competitionsEnabled, hasCompetitionDatabase } from "../../../../lib/competitions/access.js";
import { moderateText } from "../../../../lib/competitions/moderation.js";
import { sha256Hex } from "../../../../lib/competitions/media-policy.js";
import { getCompetitionParticipantSession } from "../../../../lib/competitions/participant-auth.js";
import { authorizeCompetitionRead } from "../../../../lib/competitions/public-access.js";
import { competitionRateLimit, rateLimitHeaders } from "../../../../lib/competitions/rate-limit.js";
import { getPublicCompetitionBySlug } from "../../../../lib/competitions/repository.js";
import { updateOwnedSubmissionDraft } from "../../../../lib/competitions/submission-edit.js";
import {
  getAccountSubmission,
  getSubmissionLocation,
  listSubmissionImages,
  listSubmissionParticipants,
  recordTextModerationChecks,
  submitSubmissionForReview,
  withdrawSubmission
} from "../../../../lib/competitions/submissions.js";
import { json, methodNotAllowed, unauthorized } from "../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../lib/validation.js";

const encoder = new TextEncoder();

function slugValue(context) {
  const value = typeof context?.params?.slug === "string" ? context.params.slug.trim().toLowerCase() : "";
  return /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(value) ? value : null;
}

function submissionId(context) {
  const value = typeof context?.params?.id === "string" ? context.params.id.trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
}

function cleanTitle(value) {
  if (typeof value !== "string") return null;
  const title = value.trim().replace(/\s+/g, " ");
  return title.length >= 1 && title.length <= 100 ? title : null;
}

function cleanDescription(value, max) {
  if (typeof value !== "string") return null;
  const description = value.replace(/\r\n?/g, "\n").trim();
  return description.length >= 1 && description.length <= max ? description : null;
}

function hasIntegerCoordinates(source) {
  return Number.isInteger(source.x)
    && Number.isInteger(source.y)
    && Number.isInteger(source.z);
}

function validLocationSource(source, worldName) {
  return Boolean(source)
    && typeof source === "object"
    && !Array.isArray(source)
    && Boolean(worldName)
    && worldName.length <= 128
    && hasIntegerCoordinates(source)
    && source.exactCoordinatesConfirmed === true;
}

function requestedLocation(input, requested) {
  if (!requested) return null;
  const source = input?.location;
  const worldName = source && typeof source.worldName === "string" ? source.worldName.trim() : "";
  if (!validLocationSource(source, worldName)) return undefined;
  return {
    worldName,
    x: source.x,
    y: source.y,
    z: source.z,
    exactCoordinatesConfirmed: true
  };
}

function needsChangesWindowOpen(competition) {
  if (competition.lifecycleState !== "REVIEW") return false;
  const closeAt = Date.parse(competition.config?.schedule?.reviewCloseAt ?? "");
  return Number.isFinite(closeAt) && Date.now() <= closeAt;
}

function ownerCanEditSubmission(competition, submission) {
  return (
    competition.lifecycleState === "SUBMISSIONS_OPEN" && submission.status === "DRAFT"
  ) || (
    submission.status === "NEEDS_CHANGES" && needsChangesWindowOpen(competition)
  );
}

function ownerRoute(context) {
  const slug = slugValue(context);
  const id = submissionId(context);
  return slug && id && slug !== "admin" ? { slug, id } : null;
}

async function resolveParticipantSession(context) {
  if (!hasCompetitionDatabase(context.env)) {
    return { response: json({ error: "competition_database_unavailable" }, 503) };
  }
  try {
    const session = await getCompetitionParticipantSession(context.request, context.env.COMPETITIONS_DB);
    return session ? { session } : { response: unauthorized() };
  } catch {
    return { response: json({ error: "competition_identity_unavailable" }, 503) };
  }
}

async function loadOwnerSubmission(context, route, session) {
  try {
    const competition = await getPublicCompetitionBySlug(context.env.COMPETITIONS_DB, route.slug);
    if (!competition) return { response: json({ error: "competition_not_found" }, 404) };
    const submission = await getAccountSubmission(
      context.env.COMPETITIONS_DB,
      competition.id,
      route.id,
      session.subject
    );
    if (!submission) return { response: json({ error: "submission_not_found" }, 404) };
    return { session, competition, submission };
  } catch {
    return { response: json({ error: "submission_unavailable" }, 503) };
  }
}

async function resolveOwnerContext(context) {
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
  const read = await authorizeCompetitionRead(context);
  if (read.response) return { response: read.response };
  const resolvedSession = await resolveParticipantSession(context);
  if (resolvedSession.response) return resolvedSession;
  const route = ownerRoute(context);
  if (!route) return { response: json({ error: "submission_not_found" }, 404) };
  return loadOwnerSubmission(context, route, resolvedSession.session);
}

async function submissionView(db, submission) {
  const [participants, images, location] = await Promise.all([
    listSubmissionParticipants(db, submission.id),
    listSubmissionImages(db, submission.id),
    getSubmissionLocation(db, submission.id)
  ]);
  return { ...submission, participants, images, location };
}

export async function onRequestGet(context) {
  const resolved = await resolveOwnerContext(context);
  if (resolved.response) return resolved.response;
  try {
    return json({ submission: await submissionView(context.env.COMPETITIONS_DB, resolved.submission) });
  } catch {
    return json({ error: "submission_unavailable" }, 503);
  }
}

function draftRevision(input) {
  return Number.isInteger(input?.expectedRevision) && input.expectedRevision >= 1
    ? input.expectedRevision
    : null;
}

function draftDetails(input, competition) {
  const title = cleanTitle(input?.title);
  const description = cleanDescription(input?.description, competition.config.entries.maxDescriptionChars);
  const location = requestedLocation(input, Boolean(competition.config.entries.coordinatesRequested));
  return title && description && location !== undefined
    ? { title, description, location }
    : null;
}

async function readJsonInput(request) {
  let input;
  try {
    input = await request.json();
  } catch {
    input = null;
  }
  return input;
}

async function readDraftUpdate(request, competition) {
  const input = await readJsonInput(request);
  const expectedRevision = draftRevision(input);
  if (expectedRevision === null) {
    return { response: json({ error: "invalid_submission_revision" }, 400) };
  }
  const details = draftDetails(input, competition);
  if (!details) {
    return { response: json({ error: "invalid_submission_details" }, 400) };
  }
  return {
    update: {
      expectedRevision,
      title: details.title,
      description: details.description,
      location: details.location
    }
  };
}

async function persistDraftUpdate(context, resolved, update) {
  const { session, competition, submission } = resolved;
  try {
    const result = await updateOwnedSubmissionDraft(context.env.COMPETITIONS_DB, {
      competitionId: competition.id,
      submissionId: submission.id,
      ownerSubject: session.subject,
      actorUuid: submission.ownerUuid,
      expectedRevision: update.expectedRevision,
      expectedConfigVersion: competition.configVersion,
      reviewCloseAt: competition.config?.schedule?.reviewCloseAt ?? null,
      title: update.title,
      description: update.description,
      location: update.location,
      clearLocation: !competition.config.entries.coordinatesRequested,
      updatedAt: new Date().toISOString(),
      auditEventId: crypto.randomUUID(),
      note: submission.status === "NEEDS_CHANGES" ? "Entrant updated requested changes" : "Entrant updated draft"
    });
    if (result.status !== "UPDATED") return json({ error: "submission_revision_conflict" }, 409);
    const fresh = await getAccountSubmission(
      context.env.COMPETITIONS_DB,
      competition.id,
      submission.id,
      session.subject
    );
    return json({ submission: await submissionView(context.env.COMPETITIONS_DB, fresh) });
  } catch {
    return json({ error: "submission_update_failed" }, 503);
  }
}

async function moderateSubmissionText(context, competition, submission) {
  const checkedAt = new Date().toISOString();
  const [titleModeration, descriptionModeration, titleHash, descriptionHash] = await Promise.all([
    moderateText(submission.title, context.env),
    moderateText(submission.description, context.env),
    sha256Hex(encoder.encode(submission.title)),
    sha256Hex(encoder.encode(submission.description))
  ]);
  const checks = [
    {
      id: crypto.randomUUID(),
      competitionId: competition.id,
      submissionId: submission.id,
      targetType: "TITLE",
      ...titleModeration,
      contentHash: titleHash,
      checkedAt
    },
    {
      id: crypto.randomUUID(),
      competitionId: competition.id,
      submissionId: submission.id,
      targetType: "DESCRIPTION",
      ...descriptionModeration,
      contentHash: descriptionHash,
      checkedAt
    }
  ];
  await recordTextModerationChecks(context.env.COMPETITIONS_DB, checks);
  return checks;
}

async function submissionModerationRateLimit(context, session) {
  const result = await competitionRateLimit(context.env.COMPETITIONS_DB, {
    scope: "submission-moderation",
    identity: session.subject,
    limit: 10,
    windowSeconds: 600
  });
  return result.allowed
    ? null
    : json({ error: "rate_limited", retryAfterSeconds: result.retryAfterSeconds }, 429, rateLimitHeaders(result));
}

async function withdrawOwnedSubmission(context, resolved) {
  const { session, competition, submission } = resolved;
  if (
    competition.lifecycleState !== "SUBMISSIONS_OPEN"
    && competition.lifecycleState !== "REVIEW"
  ) {
    return json({ error: "submission_locked" }, 409);
  }
  try {
    const withdrawn = await withdrawSubmission(context.env.COMPETITIONS_DB, {
      competitionId: competition.id,
      submissionId: submission.id,
      ownerSubject: session.subject,
      actorUuid: submission.ownerUuid,
      expectedConfigVersion: competition.configVersion,
      withdrawnAt: new Date().toISOString(),
      auditEventId: crypto.randomUUID()
    });
    if (!withdrawn) return json({ error: "submission_locked" }, 409);
    return json({ status: "WITHDRAWN" });
  } catch {
    return json({ error: "submission_withdraw_failed" }, 503);
  }
}

export async function onRequestPut(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const resolved = await resolveOwnerContext(context);
  if (resolved.response) return resolved.response;
  if (!ownerCanEditSubmission(resolved.competition, resolved.submission)) {
    return json({ error: "submission_locked" }, 409);
  }
  const parsed = await readDraftUpdate(context.request, resolved.competition);
  if (parsed.response) return parsed.response;
  return persistDraftUpdate(context, resolved, parsed.update);
}

async function submissionRequirementsResponse(context, competition, submission) {
  const [images, location] = await Promise.all([
    listSubmissionImages(context.env.COMPETITIONS_DB, submission.id),
    getSubmissionLocation(context.env.COMPETITIONS_DB, submission.id)
  ]);
  if (images.length < competition.config.entries.minImages) {
    return json({ error: "submission_image_count_invalid" }, 409);
  }
  if (images.some((image) => image.moderationState !== "PASSED")) {
    return json({ error: "submission_image_moderation_incomplete" }, 409);
  }
  if (competition.config.entries.coordinatesRequested && (!location || !location.exactCoordinatesConfirmed)) {
    return json({ error: "submission_coordinates_required" }, 409);
  }
  return null;
}

function moderationOutcomeResponse(checks) {
  if (checks.some((check) => check.outcome === "ERROR")) {
    return json({ error: "moderation_unavailable" }, 503);
  }
  return checks.some((check) => check.outcome !== "PASSED")
    ? json({ error: "submission_text_blocked" }, 422)
    : null;
}

async function submissionModerationResponse(context, competition, submission, session) {
  const limited = await submissionModerationRateLimit(context, session);
  if (limited) return limited;
  const checks = await moderateSubmissionText(context, competition, submission);
  return moderationOutcomeResponse(checks);
}

async function transitionOwnedSubmission(context, resolved, expectedRevision) {
  const { session, competition, submission } = resolved;
  const result = await submitSubmissionForReview(context.env.COMPETITIONS_DB, {
    competitionId: competition.id,
    submissionId: submission.id,
    ownerSubject: session.subject,
    actorUuid: submission.ownerUuid,
    expectedRevision,
    expectedConfigVersion: competition.configVersion,
    reviewCloseAt: competition.config?.schedule?.reviewCloseAt ?? null,
    minImages: competition.config.entries.minImages,
    coordinatesRequested: Boolean(competition.config.entries.coordinatesRequested),
    submittedAt: new Date().toISOString(),
    auditEventId: crypto.randomUUID()
  });
  return result.status === "SUBMITTED"
    ? json({ status: "PENDING_REVIEW", revision: result.revision })
    : json({ error: "submission_revision_conflict" }, 409);
}

function submissionFailureResponse(error) {
  return error instanceof TypeError || error instanceof RangeError
    ? json({ error: "invalid_submission", detail: String(error.message) }, 400)
    : json({ error: "submission_submit_failed" }, 503);
}

async function submitOwnedSubmission(context, resolved, expectedRevision) {
  const { session, competition, submission } = resolved;
  if (!ownerCanEditSubmission(competition, submission)) {
    return json({ error: "submission_locked" }, 409);
  }
  if (submission.revision !== expectedRevision) {
    return json({ error: "submission_revision_conflict" }, 409);
  }
  try {
    const requirements = await submissionRequirementsResponse(context, competition, submission);
    if (requirements) return requirements;
    const moderation = await submissionModerationResponse(context, competition, submission, session);
    if (moderation) return moderation;
    return transitionOwnedSubmission(context, resolved, expectedRevision);
  } catch (error) {
    return submissionFailureResponse(error);
  }
}

function submittedRevision(input) {
  return input?.action === "SUBMIT"
    ? draftRevision(input)
    : null;
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const resolved = await resolveOwnerContext(context);
  if (resolved.response) return resolved.response;
  const input = await readJsonInput(context.request);
  if (input?.action === "WITHDRAW") return withdrawOwnedSubmission(context, resolved);
  const expectedRevision = submittedRevision(input);
  if (expectedRevision === null) {
    return json({ error: "invalid_submission_action" }, 400);
  }
  return submitOwnedSubmission(context, resolved, expectedRevision);
}

export function onRequest() {
  return methodNotAllowed(["GET", "PUT", "POST"]);
}

export {
  cleanDescription,
  cleanTitle,
  needsChangesWindowOpen,
  requestedLocation,
  slugValue,
  submissionId,
  submissionModerationRateLimit
};
