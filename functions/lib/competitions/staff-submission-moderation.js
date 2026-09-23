import { staffSubmissionEditPolicy } from "./submission-edit-policy.js";

function requireWritableDatabase(db) {
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new TypeError("Competition database binding is not writable");
  }
  return db;
}

function normalizedFlagReason(flagged, value) {
  if (!flagged) return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError("A private flag reason is required");
  }
  return value.trim();
}

function nullishFallback(value, fallback) {
  return value === null || value === undefined ? fallback : value;
}

function submissionFlagPolicy(flag) {
  const flagged = Boolean(flag.flagged);
  const reason = normalizedFlagReason(flagged, flag.reason);
  return {
    flagged,
    reason,
    action: flagged ? "SUBMISSION_FLAGGED" : "SUBMISSION_FLAG_CLEARED",
    note: flagged ? reason : nullishFallback(flag.note, "Internal submission flag cleared")
  };
}

function submissionFlagMutation(database, flag, policy) {
  if (policy.flagged) {
    return database.prepare(`
      INSERT INTO submission_moderation (
        submission_id, flag_reason, flagged_by_uuid, flagged_at
      )
      SELECT ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM submissions
        WHERE id = ? AND competition_id = ? AND removed_at IS NULL
      )
      ON CONFLICT(submission_id) DO UPDATE SET
        flag_reason = excluded.flag_reason,
        flagged_by_uuid = excluded.flagged_by_uuid,
        flagged_at = excluded.flagged_at
    `).bind(
      flag.submissionId,
      policy.reason,
      flag.actorUuid,
      flag.changedAt,
      flag.submissionId,
      flag.competitionId
    );
  }
  return database.prepare(`
    UPDATE submission_moderation
    SET flag_reason = NULL,
        flagged_by_uuid = NULL,
        flagged_at = NULL
    WHERE submission_id = ?
      AND flagged_at IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM submissions
        WHERE id = ? AND competition_id = ?
      )
  `).bind(flag.submissionId, flag.submissionId, flag.competitionId);
}

export async function setSubmissionFlag(db, flag) {
  const database = requireWritableDatabase(db);
  const policy = submissionFlagPolicy(flag);
  const results = await database.batch([
    submissionFlagMutation(database, flag, policy),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, submission_id, actor_subject, actor_uuid,
        action, after_json, note, created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE changes() = 1
    `).bind(
      flag.auditEventId,
      flag.competitionId,
      flag.submissionId,
      flag.actorSubject,
      flag.actorUuid,
      policy.action,
      JSON.stringify({ flagged: policy.flagged, reason: policy.reason }),
      policy.note,
      flag.changedAt
    )
  ]);
  return Number(results?.[0]?.meta?.changes ?? 0) === 1;
}

const MODERATION_TRANSITIONS = Object.freeze({
  APPROVE: Object.freeze({
    targetStatus: "APPROVED",
    allowedCurrent: ["PENDING_REVIEW"],
    readiness: true,
    approved: true
  }),
  NEEDS_CHANGES: Object.freeze({ targetStatus: "NEEDS_CHANGES", allowedCurrent: ["PENDING_REVIEW"] }),
  REJECT: Object.freeze({ targetStatus: "REJECTED", allowedCurrent: ["PENDING_REVIEW"] }),
  DISQUALIFY: Object.freeze({
    targetStatus: "DISQUALIFIED",
    allowedCurrent: ["PENDING_REVIEW", "NEEDS_CHANGES", "APPROVED"],
    disqualified: true
  })
});

function approvalDecisionPolicy(decision, required) {
  if (!required) return { required: 0, minImages: 0, coordinatesRequested: 0 };
  if (!Number.isInteger(decision.minImages) || decision.minImages < 0) {
    throw new TypeError("Minimum submission image count is invalid");
  }
  if (typeof decision.coordinatesRequested !== "boolean") {
    throw new TypeError("Submission coordinate requirement is invalid");
  }
  return {
    required: 1,
    minImages: decision.minImages,
    coordinatesRequested: decision.coordinatesRequested ? 1 : 0
  };
}

function nullable(value) {
  return value === null || value === undefined ? null : value;
}

function transitionTimestamp(enabled, reviewedAt) {
  return enabled ? reviewedAt : null;
}

function moderationAuditNote(decision) {
  if (decision.privateNote) return decision.privateNote;
  if (decision.publicReason) return decision.publicReason;
  return `Submission ${decision.action.toLowerCase()}`;
}

function moderationDecisionPolicy(decision) {
  const transition = MODERATION_TRANSITIONS[decision.action];
  if (!transition) throw new TypeError("Invalid submission moderation action");
  const config = staffSubmissionEditPolicy(decision.expectedConfigVersion);
  const approval = approvalDecisionPolicy(decision, Boolean(transition.readiness));
  return {
    targetStatus: transition.targetStatus,
    allowedCurrent: transition.allowedCurrent,
    approvedAt: transitionTimestamp(Boolean(transition.approved), decision.reviewedAt),
    disqualifiedAt: transitionTimestamp(Boolean(transition.disqualified), decision.reviewedAt),
    configVersion: config.configVersion,
    requiresReadiness: approval.required,
    minImages: approval.minImages,
    coordinatesRequested: approval.coordinatesRequested,
    publicReason: nullable(decision.publicReason),
    privateNote: nullable(decision.privateNote),
    auditNote: moderationAuditNote(decision)
  };
}

export async function moderateSubmission(db, decision) {
  const database = requireWritableDatabase(db);
  const policy = moderationDecisionPolicy(decision);
  const placeholders = policy.allowedCurrent.map(() => "?").join(",");
  const results = await database.batch([
    database.prepare(`
      UPDATE submissions
      SET status = ?,
          approved_at = CASE WHEN ? IS NOT NULL THEN ? ELSE approved_at END,
          updated_at = ?
      WHERE id = ?
        AND competition_id = ?
        AND removed_at IS NULL
        AND status = ?
        AND status IN (${placeholders})
        AND EXISTS (
          SELECT 1
          FROM competitions competition
          WHERE competition.id = submissions.competition_id
            AND competition.current_config_version = ?
        )
        AND (
          ? = 0
          OR (
            (
              SELECT COUNT(*)
              FROM submission_images image
              WHERE image.submission_id = submissions.id
                AND image.removed_at IS NULL
            ) >= ?
            AND NOT EXISTS (
              SELECT 1
              FROM submission_images image
              WHERE image.submission_id = submissions.id
                AND image.removed_at IS NULL
                AND image.moderation_state <> 'PASSED'
            )
            AND (
              ? = 0
              OR EXISTS (
                SELECT 1
                FROM submission_private_locations location
                WHERE location.submission_id = submissions.id
                  AND location.exact_coordinates_confirmed = 1
              )
            )
          )
        )
    `).bind(
      policy.targetStatus,
      policy.approvedAt,
      policy.approvedAt,
      decision.reviewedAt,
      decision.submissionId,
      decision.competitionId,
      decision.previousStatus,
      ...policy.allowedCurrent,
      policy.configVersion,
      policy.requiresReadiness,
      policy.minImages,
      policy.coordinatesRequested
    ),
    database.prepare(`
      INSERT INTO submission_moderation (
        submission_id, public_reason, private_note, reviewed_by_uuid,
        reviewed_at, disqualified_at
      )
      SELECT ?, ?, ?, ?, ?, ?
      WHERE changes() = 1
      ON CONFLICT(submission_id) DO UPDATE SET
        public_reason = excluded.public_reason,
        private_note = excluded.private_note,
        reviewed_by_uuid = excluded.reviewed_by_uuid,
        reviewed_at = excluded.reviewed_at,
        disqualified_at = excluded.disqualified_at
    `).bind(
      decision.submissionId,
      policy.publicReason,
      policy.privateNote,
      decision.reviewerUuid,
      decision.reviewedAt,
      policy.disqualifiedAt
    ),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, submission_id, actor_subject, actor_uuid,
        action, before_json, after_json, note, created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE changes() = 1
    `).bind(
      decision.auditEventId,
      decision.competitionId,
      decision.submissionId,
      decision.actorSubject,
      decision.reviewerUuid,
      `SUBMISSION_${decision.action}`,
      JSON.stringify({ status: decision.previousStatus }),
      JSON.stringify({ status: policy.targetStatus }),
      policy.auditNote,
      decision.reviewedAt
    )
  ]);
  if (Number(results?.[0]?.meta?.changes ?? 0) === 1) {
    return { status: "UPDATED", submissionStatus: policy.targetStatus };
  }
  return { status: "CONFLICT" };
}
