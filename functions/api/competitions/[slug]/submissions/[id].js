import { competitionsEnabled, hasCompetitionDatabase } from "../../../../lib/competitions/access.js";
import { moderateText } from "../../../../lib/competitions/moderation.js";
import { sha256Hex } from "../../../../lib/competitions/media-policy.js";
import { getCompetitionParticipantSession } from "../../../../lib/competitions/participant-auth.js";
import { authorizeCompetitionRead } from "../../../../lib/competitions/public-access.js";
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

function requestedLocation(input, requested) {
  if (!requested) return null;
  const source = input?.location;
  if (!source || typeof source !== "object" || Array.isArray(source)) return undefined;
  const worldName = typeof source.worldName === "string" ? source.worldName.trim() : "";
  if (
    !worldName
    || worldName.length > 128
    || !Number.isInteger(source.x)
    || !Number.isInteger(source.y)
    || !Number.isInteger(source.z)
    || source.exactCoordinatesConfirmed !== true
  ) return undefined;
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

async function resolveOwnerContext(context) {
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
  const read = await authorizeCompetitionRead(context);
  if (read.response) return { response: read.response };
  if (!hasCompetitionDatabase(context.env)) {
    return { response: json({ error: "competition_database_unavailable" }, 503) };
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
  if (!slug || !id || slug === "admin") return { response: json({ error: "submission_not_found" }, 404) };
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

export async function onRequestPut(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const resolved = await resolveOwnerContext(context);
  if (resolved.response) return resolved.response;
  const { session, competition, submission } = resolved;
  const editable = (
    competition.lifecycleState === "SUBMISSIONS_OPEN" && submission.status === "DRAFT"
  ) || (
    submission.status === "NEEDS_CHANGES" && needsChangesWindowOpen(competition)
  );
  if (!editable) return json({ error: "submission_locked" }, 409);

  let input;
  try {
    input = await context.request.json();
  } catch {
    input = null;
  }
  if (!Number.isInteger(input?.expectedRevision) || input.expectedRevision < 1) {
    return json({ error: "invalid_submission_revision" }, 400);
  }
  const title = cleanTitle(input?.title);
  const description = cleanDescription(input?.description, competition.config.entries.maxDescriptionChars);
  const location = requestedLocation(input, Boolean(competition.config.entries.coordinatesRequested));
  if (!title || !description || location === undefined) {
    return json({ error: "invalid_submission_details" }, 400);
  }

  try {
    const result = await updateOwnedSubmissionDraft(context.env.COMPETITIONS_DB, {
      competitionId: competition.id,
      submissionId: submission.id,
      ownerSubject: session.subject,
      actorUuid: submission.ownerUuid,
      expectedRevision: input.expectedRevision,
      title,
      description,
      location,
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

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const resolved = await resolveOwnerContext(context);
  if (resolved.response) return resolved.response;
  const { session, competition, submission } = resolved;

  let input;
  try {
    input = await context.request.json();
  } catch {
    input = null;
  }
  const action = input?.action;

  if (action === "WITHDRAW") {
    if (!new Set(["SUBMISSIONS_OPEN", "REVIEW"]).has(competition.lifecycleState)) {
      return json({ error: "submission_locked" }, 409);
    }
    try {
      const withdrawn = await withdrawSubmission(context.env.COMPETITIONS_DB, {
        competitionId: competition.id,
        submissionId: submission.id,
        ownerSubject: session.subject,
        actorUuid: submission.ownerUuid,
        withdrawnAt: new Date().toISOString(),
        auditEventId: crypto.randomUUID()
      });
      if (!withdrawn) return json({ error: "submission_locked" }, 409);
      return json({ status: "WITHDRAWN" });
    } catch {
      return json({ error: "submission_withdraw_failed" }, 503);
    }
  }

  if (action !== "SUBMIT" || !Number.isInteger(input?.expectedRevision) || input.expectedRevision < 1) {
    return json({ error: "invalid_submission_action" }, 400);
  }

  const canSubmit = (
    competition.lifecycleState === "SUBMISSIONS_OPEN" && submission.status === "DRAFT"
  ) || (
    submission.status === "NEEDS_CHANGES" && needsChangesWindowOpen(competition)
  );
  if (!canSubmit) return json({ error: "submission_locked" }, 409);
  if (submission.revision !== input.expectedRevision) return json({ error: "submission_revision_conflict" }, 409);

  try {
    const [images, location] = await Promise.all([
      listSubmissionImages(context.env.COMPETITIONS_DB, submission.id),
      getSubmissionLocation(context.env.COMPETITIONS_DB, submission.id)
    ]);
    if (images.length < competition.config.entries.minImages || images.length > competition.config.entries.maxImages) {
      return json({ error: "submission_image_count_invalid" }, 409);
    }
    if (images.some((image) => image.moderationState !== "PASSED")) {
      return json({ error: "submission_image_moderation_incomplete" }, 409);
    }
    if (competition.config.entries.coordinatesRequested && (!location || !location.exactCoordinatesConfirmed)) {
      return json({ error: "submission_coordinates_required" }, 409);
    }

    const checks = await moderateSubmissionText(context, competition, submission);
    if (checks.some((check) => check.outcome === "ERROR")) {
      return json({ error: "moderation_unavailable" }, 503);
    }
    if (checks.some((check) => check.outcome !== "PASSED")) {
      return json({ error: "submission_text_blocked" }, 422);
    }

    const result = await submitSubmissionForReview(context.env.COMPETITIONS_DB, {
      competitionId: competition.id,
      submissionId: submission.id,
      ownerSubject: session.subject,
      actorUuid: submission.ownerUuid,
      expectedRevision: input.expectedRevision,
      submittedAt: new Date().toISOString(),
      auditEventId: crypto.randomUUID()
    });
    if (result.status !== "SUBMITTED") return json({ error: "submission_revision_conflict" }, 409);
    return json({ status: "PENDING_REVIEW", revision: result.revision });
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      return json({ error: "invalid_submission", detail: String(error.message) }, 400);
    }
    return json({ error: "submission_submit_failed" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET", "PUT", "POST"]);
}

export { cleanDescription, cleanTitle, needsChangesWindowOpen, requestedLocation, slugValue, submissionId };
