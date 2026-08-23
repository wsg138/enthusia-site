import { authenticateRequest } from "../../../../../lib/auth.js";
import {
  canManageCompetitions,
  canModerateCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase
} from "../../../../../lib/competitions/access.js";
import { getAdminCompetition } from "../../../../../lib/competitions/drafts.js";
import { getPrivateSubmissionLocation } from "../../../../../lib/competitions/repository.js";
import {
  getStaffSubmission,
  listStaffSubmissionModerationChecks,
  moderateSubmission,
  removeStaffSubmission,
  restoreStaffSubmission,
  staffEditSubmission
} from "../../../../../lib/competitions/staff-submissions.js";
import { listSubmissionImages, listSubmissionParticipants } from "../../../../../lib/competitions/submissions.js";
import { json, methodNotAllowed, unauthorized } from "../../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../../lib/validation.js";

function paramUuid(context, key) {
  const value = typeof context?.params?.[key] === "string" ? context.params[key].trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
}

function reason(value, max, required = false) {
  if ((value === null || value === undefined || value === "") && !required) return null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized || normalized.length > max) return null;
  return normalized;
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

async function authorize(context) {
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
  if (!hasCompetitionDatabase(context.env)) return { response: json({ error: "competition_database_unavailable" }, 503) };
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
  if (!competitionId || !submissionId) return { response: json({ error: "submission_not_found" }, 404) };
  try {
    const [competition, submission] = await Promise.all([
      getAdminCompetition(context.env.COMPETITIONS_DB, competitionId),
      getStaffSubmission(context.env.COMPETITIONS_DB, competitionId, submissionId)
    ]);
    if (!competition || !submission) return { response: json({ error: "submission_not_found" }, 404) };
    return { competition, submission, competitionId, submissionId, session };
  } catch {
    return { response: json({ error: "submission_unavailable" }, 503) };
  }
}

async function approvalReadiness(db, competition, submissionId) {
  const [images, location] = await Promise.all([
    listSubmissionImages(db, submissionId),
    getPrivateSubmissionLocation(db, submissionId)
  ]);
  const minImages = Number(competition.config?.entries?.minImages ?? 1);
  const maxImages = Number(competition.config?.entries?.maxImages ?? 8);
  if (images.length < minImages || images.length > maxImages) {
    return { error: "submission_image_count_invalid", imageCount: images.length, minImages, maxImages };
  }
  if (images.some((image) => image.moderationState !== "PASSED")) {
    return { error: "submission_image_moderation_incomplete" };
  }
  if (competition.config?.entries?.coordinatesRequested && (!location || !location.exactCoordinatesConfirmed)) {
    return { error: "submission_coordinates_required" };
  }
  return null;
}

export async function onRequestGet(context) {
  const authorized = await authorize(context);
  if (authorized.response) return authorized.response;
  const resolved = await resolve(context, authorized.session);
  if (resolved.response) return resolved.response;
  try {
    const [participants, images, location, moderationChecks] = await Promise.all([
      listSubmissionParticipants(context.env.COMPETITIONS_DB, resolved.submissionId),
      listSubmissionImages(context.env.COMPETITIONS_DB, resolved.submissionId),
      getPrivateSubmissionLocation(context.env.COMPETITIONS_DB, resolved.submissionId),
      listStaffSubmissionModerationChecks(context.env.COMPETITIONS_DB, resolved.submissionId)
    ]);
    return json({
      competition: {
        id: resolved.competition.id,
        title: resolved.competition.title,
        lifecycleState: resolved.competition.lifecycleState,
        configVersion: resolved.competition.configVersion
      },
      submission: resolved.submission,
      participants,
      images: images.map((image) => ({
        ...image,
        previewUrl: `/api/competitions/admin/${resolved.competitionId}/submissions/${resolved.submissionId}/images/${image.id}`
      })),
      location: location ? {
        ...location,
        exactCoordinatesConfirmed: Boolean(location.exactCoordinatesConfirmed)
      } : null,
      moderationChecks
    });
  } catch {
    return json({ error: "submission_detail_unavailable" }, 503);
  }
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const authorized = await authorize(context);
  if (authorized.response) return authorized.response;
  const resolved = await resolve(context, authorized.session);
  if (resolved.response) return resolved.response;
  const { competition, submission, competitionId, submissionId, session } = resolved;

  let input;
  try {
    input = await context.request.json();
  } catch {
    input = null;
  }
  const action = input?.action;

  if (new Set(["APPROVE", "NEEDS_CHANGES", "REJECT", "DISQUALIFY"]).has(action)) {
    if (submission.ownerUuid === session.player.uuid) {
      return json({ error: "staff_cannot_moderate_own_entry" }, 409);
    }
    const publicReason = reason(input?.publicReason, 1000, action !== "APPROVE");
    const privateNote = reason(input?.privateNote, 4000, false);
    if (action !== "APPROVE" && !publicReason) return json({ error: "public_reason_required" }, 400);
    if (input?.privateNote && !privateNote) return json({ error: "private_note_invalid" }, 400);

    if (action === "APPROVE") {
      try {
        const readiness = await approvalReadiness(context.env.COMPETITIONS_DB, competition, submissionId);
        if (readiness) return json(readiness, 409);
      } catch {
        return json({ error: "submission_readiness_unavailable" }, 503);
      }
    }

    try {
      const result = await moderateSubmission(context.env.COMPETITIONS_DB, {
        competitionId,
        submissionId,
        previousStatus: submission.status,
        action,
        publicReason,
        privateNote,
        reviewerUuid: session.player.uuid,
        actorSubject: session.subject,
        reviewedAt: new Date().toISOString(),
        auditEventId: crypto.randomUUID()
      });
      if (result.status !== "UPDATED") return json({ error: "submission_state_conflict" }, 409);
      return json(result);
    } catch {
      return json({ error: "submission_moderation_failed" }, 503);
    }
  }

  if (action === "REMOVE") {
    const privateNote = reason(input?.privateNote, 4000, true);
    if (!privateNote) return json({ error: "private_note_required" }, 400);
    try {
      const removed = await removeStaffSubmission(context.env.COMPETITIONS_DB, {
        competitionId,
        submissionId,
        actorSubject: session.subject,
        removedByUuid: session.player.uuid,
        removedAt: new Date().toISOString(),
        privateNote,
        auditEventId: crypto.randomUUID()
      });
      if (!removed) return json({ error: "submission_state_conflict" }, 409);
      return json({ status: "REMOVED" });
    } catch {
      return json({ error: "submission_remove_failed" }, 503);
    }
  }

  if (action === "RESTORE") {
    const privateNote = reason(input?.privateNote, 4000, false);
    try {
      const restored = await restoreStaffSubmission(context.env.COMPETITIONS_DB, {
        competitionId,
        submissionId,
        actorSubject: session.subject,
        restoredByUuid: session.player.uuid,
        restoredAt: new Date().toISOString(),
        privateNote,
        auditEventId: crypto.randomUUID()
      });
      if (!restored) return json({ error: "submission_state_conflict" }, 409);
      return json({ status: "RESTORED" });
    } catch {
      return json({ error: "submission_restore_failed" }, 503);
    }
  }

  if (action === "EDIT") {
    if (!canManageCompetitions(session, context.env)) return json({ error: "competition_manager_required" }, 403);
    if (!Number.isInteger(input?.expectedRevision) || input.expectedRevision < 1) {
      return json({ error: "invalid_submission_revision" }, 400);
    }
    const title = cleanTitle(input?.title);
    const description = cleanDescription(input?.description, competition.config.entries.maxDescriptionChars);
    const privateNote = reason(input?.privateNote, 4000, true);
    if (!title || !description || !privateNote) return json({ error: "invalid_staff_edit" }, 400);
    try {
      const result = await staffEditSubmission(context.env.COMPETITIONS_DB, {
        competitionId,
        submissionId,
        expectedRevision: input.expectedRevision,
        title,
        description,
        actorSubject: session.subject,
        editorUuid: session.player.uuid,
        editedAt: new Date().toISOString(),
        privateNote,
        auditEventId: crypto.randomUUID()
      });
      if (result.status !== "UPDATED") return json({ error: "submission_revision_conflict" }, 409);
      return json(result);
    } catch {
      return json({ error: "submission_staff_edit_failed" }, 503);
    }
  }

  return json({ error: "invalid_submission_action" }, 400);
}

export function onRequest() {
  return methodNotAllowed(["GET", "POST"]);
}

export { approvalReadiness, cleanDescription, cleanTitle, paramUuid, reason };
