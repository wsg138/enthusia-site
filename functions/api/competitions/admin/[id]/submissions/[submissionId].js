import { authenticateRequest } from "../../../../../lib/auth.js";
import {
  canManageCompetitions,
  canModerateCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase
} from "../../../../../lib/competitions/access.js";
import { getAdminCompetition } from "../../../../../lib/competitions/drafts.js";
import { getPrivateSubmissionLocation } from "../../../../../lib/competitions/repository.js";
import { staffSubmissionConflict } from "../../../../../lib/competitions/staff-conflicts.js";
import {
  getStaffSubmission,
  listStaffSubmissionModerationChecks,
  moderateSubmission,
  removeStaffSubmission,
  restoreStaffSubmission,
  setSubmissionFlag,
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

function reason(value, max) {
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

async function staffConflictResponse(context, submission, session) {
  try {
    const conflict = await staffSubmissionConflict(
      context.env.COMPETITIONS_DB,
      context.env,
      submission,
      session.player.uuid
    );
    if (!conflict.conflict) return null;
    return json({
      error: "staff_cannot_moderate_own_entry",
      conflictReason: conflict.reason
    }, 409);
  } catch {
    return json({ error: "staff_conflict_check_unavailable" }, 503);
  }
}

async function approvalReadiness(db, competition, submissionId) {
  const [images, location] = await Promise.all([
    listSubmissionImages(db, submissionId),
    getPrivateSubmissionLocation(db, submissionId)
  ]);
  const minImages = Number(competition.config?.entries?.minImages ?? 1);
  const imageError = approvalImageError(images, minImages);
  if (imageError) return imageError;
  return approvalLocationError(competition, location);
}

function approvalImageError(images, minImages) {
  if (images.length < minImages) {
    return { error: "submission_image_count_invalid", imageCount: images.length, minImages };
  }
  return images.some((image) => image.moderationState !== "PASSED")
    ? { error: "submission_image_moderation_incomplete" }
    : null;
}

function approvalLocationError(competition, location) {
  const coordinatesRequested = Boolean(competition.config?.entries?.coordinatesRequested);
  return coordinatesRequested && (!location || !location.exactCoordinatesConfirmed)
    ? { error: "submission_coordinates_required" }
    : null;
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

async function readJsonInput(request) {
  let input;
  try {
    input = await request.json();
  } catch {
    input = null;
  }
  return input;
}

async function updateSubmissionFlag(context, resolved, input) {
  const { competitionId, submissionId, session } = resolved;
  const parsed = submissionFlagInput(input);
  if (parsed.response) return parsed.response;
  try {
    const updated = await setSubmissionFlag(context.env.COMPETITIONS_DB, {
      competitionId,
      submissionId,
      flagged: parsed.flagged,
      reason: parsed.privateNote,
      note: parsed.privateNote,
      actorSubject: session.subject,
      actorUuid: session.player.uuid,
      changedAt: new Date().toISOString(),
      auditEventId: crypto.randomUUID()
    });
    if (!updated) return json({ error: "submission_flag_conflict" }, 409);
    return json({
      status: parsed.flagged ? "FLAGGED" : "FLAG_CLEARED",
      flagged: parsed.flagged
    });
  } catch {
    return json({ error: "submission_flag_update_failed" }, 503);
  }
}

function submissionFlagInput(input) {
  const flagged = input?.action === "FLAG";
  const privateNote = reason(input?.privateNote, 4000);
  if (flagged && !privateNote) return { response: json({ error: "private_note_required" }, 400) };
  if (input?.privateNote && !privateNote) return { response: json({ error: "private_note_invalid" }, 400) };
  return { flagged, privateNote };
}

function moderationInput(input) {
  const source = input || {};
  const action = source.action;
  const publicReason = reason(source.publicReason, 1000);
  const privateNote = reason(source.privateNote, 4000);
  if (publicReasonRequired(action, publicReason)) {
    return { response: json({ error: "public_reason_required" }, 400) };
  }
  if (invalidOptionalReason(source.privateNote, privateNote)) {
    return { response: json({ error: "private_note_invalid" }, 400) };
  }
  return { decision: { action, publicReason, privateNote } };
}

function publicReasonRequired(action, publicReason) {
  return action !== "APPROVE" && !publicReason;
}

function invalidOptionalReason(value, normalized) {
  return Boolean(value) && !normalized;
}

async function approvalReadinessResponse(context, resolved, action) {
  if (action !== "APPROVE") return null;
  try {
    const readiness = await approvalReadiness(
      context.env.COMPETITIONS_DB,
      resolved.competition,
      resolved.submissionId
    );
    return readiness ? json(readiness, 409) : null;
  } catch {
    return json({ error: "submission_readiness_unavailable" }, 503);
  }
}

async function persistModerationDecision(context, resolved, decision) {
  const { competition, submission, competitionId, submissionId, session } = resolved;
  try {
    const result = await moderateSubmission(context.env.COMPETITIONS_DB, {
      competitionId,
      submissionId,
      previousStatus: submission.status,
      action: decision.action,
      publicReason: decision.publicReason,
      privateNote: decision.privateNote,
      reviewerUuid: session.player.uuid,
      actorSubject: session.subject,
      reviewedAt: new Date().toISOString(),
      expectedConfigVersion: competition.configVersion,
      minImages: Number(competition.config?.entries?.minImages ?? 1),
      coordinatesRequested: Boolean(competition.config?.entries?.coordinatesRequested),
      auditEventId: crypto.randomUUID()
    });
    return result.status === "UPDATED"
      ? json(result)
      : json({ error: "submission_state_conflict" }, 409);
  } catch {
    return json({ error: "submission_moderation_failed" }, 503);
  }
}

async function updateSubmissionModeration(context, resolved, input) {
  const parsed = moderationInput(input);
  if (parsed.response) return parsed.response;
  const readiness = await approvalReadinessResponse(context, resolved, parsed.decision.action);
  if (readiness) return readiness;
  return persistModerationDecision(context, resolved, parsed.decision);
}

async function removeSubmission(context, resolved, input) {
  const { competitionId, submissionId, session } = resolved;
  const privateNote = reason(input?.privateNote, 4000);
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
    return removed
      ? json({ status: "REMOVED" })
      : json({ error: "submission_state_conflict" }, 409);
  } catch {
    return json({ error: "submission_remove_failed" }, 503);
  }
}

async function restoreSubmission(context, resolved, input) {
  const { competitionId, submissionId, session } = resolved;
  const privateNote = reason(input?.privateNote, 4000);
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
    return restored
      ? json({ status: "RESTORED" })
      : json({ error: "submission_state_conflict" }, 409);
  } catch {
    return json({ error: "submission_restore_failed" }, 503);
  }
}

function staffEditInput(input, maxDescriptionChars) {
  const expectedRevision = submissionRevision(input);
  if (expectedRevision === null) {
    return { response: json({ error: "invalid_submission_revision" }, 400) };
  }
  const title = cleanTitle(input?.title);
  const description = cleanDescription(input?.description, maxDescriptionChars);
  const privateNote = reason(input?.privateNote, 4000);
  return title && description && privateNote
    ? { edit: { expectedRevision, title, description, privateNote } }
    : { response: json({ error: "invalid_staff_edit" }, 400) };
}

function submissionRevision(input) {
  return Number.isInteger(input?.expectedRevision) && input.expectedRevision >= 1
    ? input.expectedRevision
    : null;
}

async function editSubmission(context, resolved, input) {
  const { competition, competitionId, submissionId, session } = resolved;
  if (!canManageCompetitions(session, context.env)) {
    return json({ error: "competition_manager_required" }, 403);
  }
  const parsed = staffEditInput(input, competition.config.entries.maxDescriptionChars);
  if (parsed.response) return parsed.response;
  try {
    const result = await staffEditSubmission(context.env.COMPETITIONS_DB, {
      competitionId,
      submissionId,
      expectedRevision: parsed.edit.expectedRevision,
      title: parsed.edit.title,
      description: parsed.edit.description,
      actorSubject: session.subject,
      editorUuid: session.player.uuid,
      editedAt: new Date().toISOString(),
      privateNote: parsed.edit.privateNote,
      auditEventId: crypto.randomUUID()
    });
    return result.status === "UPDATED"
      ? json(result)
      : json({ error: "submission_revision_conflict" }, 409);
  } catch {
    return json({ error: "submission_staff_edit_failed" }, 503);
  }
}

const ACTION_HANDLERS = new Map([
  ["FLAG", updateSubmissionFlag],
  ["CLEAR_FLAG", updateSubmissionFlag],
  ["APPROVE", updateSubmissionModeration],
  ["NEEDS_CHANGES", updateSubmissionModeration],
  ["REJECT", updateSubmissionModeration],
  ["DISQUALIFY", updateSubmissionModeration],
  ["REMOVE", removeSubmission],
  ["RESTORE", restoreSubmission],
  ["EDIT", editSubmission]
]);

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const authorized = await authorize(context);
  if (authorized.response) return authorized.response;
  const resolved = await resolve(context, authorized.session);
  if (resolved.response) return resolved.response;
  const input = await readJsonInput(context.request);
  const handler = ACTION_HANDLERS.get(input?.action);
  if (!handler) return json({ error: "invalid_submission_action" }, 400);
  const conflict = await staffConflictResponse(context, resolved.submission, resolved.session);
  if (conflict) return conflict;
  return handler(context, resolved, input);
}

export function onRequest() {
  return methodNotAllowed(["GET", "POST"]);
}

export { approvalReadiness, cleanDescription, cleanTitle, paramUuid, reason, staffConflictResponse };
