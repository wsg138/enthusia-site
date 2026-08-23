function requireDatabase(db) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("Competition database binding is unavailable");
  return db;
}

function requireWritableDatabase(db) {
  const database = requireDatabase(db);
  if (typeof database.batch !== "function") throw new TypeError("Competition database binding is not writable");
  return database;
}

function rows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

export async function listStaffCompetitionSubmissions(db, competitionId) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    SELECT
      s.id,
      s.entry_type AS entryType,
      s.status,
      s.owner_uuid AS ownerUuid,
      s.owner_name AS ownerName,
      s.guild_id AS guildId,
      s.guild_name_snapshot AS guildName,
      s.title,
      s.revision,
      s.staff_edited AS staffEdited,
      s.submitted_at AS submittedAt,
      s.approved_at AS approvedAt,
      s.removed_at AS removedAt,
      sm.public_reason AS publicReason,
      sm.private_note AS privateNote,
      sm.reviewed_by_uuid AS reviewedByUuid,
      sm.reviewed_at AS reviewedAt,
      sm.disqualified_at AS disqualifiedAt,
      sm.flag_reason AS flagReason,
      sm.flagged_by_uuid AS flaggedByUuid,
      sm.flagged_at AS flaggedAt,
      (SELECT COUNT(*) FROM submission_images i WHERE i.submission_id = s.id AND i.removed_at IS NULL) AS imageCount,
      (SELECT COUNT(*) FROM submission_participants p WHERE p.submission_id = s.id AND p.invite_status = 'ACCEPTED') AS acceptedParticipantCount
    FROM submissions s
    LEFT JOIN submission_moderation sm ON sm.submission_id = s.id
    WHERE s.competition_id = ?
    ORDER BY
      sm.flagged_at IS NULL ASC,
      CASE s.status
        WHEN 'PENDING_REVIEW' THEN 1
        WHEN 'NEEDS_CHANGES' THEN 2
        WHEN 'APPROVED' THEN 3
        WHEN 'DISQUALIFIED' THEN 4
        WHEN 'REJECTED' THEN 5
        WHEN 'REMOVED' THEN 6
        ELSE 7
      END,
      COALESCE(s.submitted_at, s.created_at) ASC,
      s.id ASC
  `).bind(competitionId).all();
  return rows(result).map((row) => ({
    ...row,
    staffEdited: Boolean(row.staffEdited),
    flagged: Boolean(row.flaggedAt),
    imageCount: Number(row.imageCount),
    acceptedParticipantCount: Number(row.acceptedParticipantCount)
  }));
}

export async function getStaffSubmission(db, competitionId, submissionId) {
  const database = requireDatabase(db);
  const row = await database.prepare(`
    SELECT
      s.id,
      s.competition_id AS competitionId,
      s.entry_type AS entryType,
      s.status,
      s.owner_subject AS ownerSubject,
      s.owner_uuid AS ownerUuid,
      s.owner_name AS ownerName,
      s.guild_id AS guildId,
      s.guild_name_snapshot AS guildName,
      s.title,
      s.description,
      s.cover_image_id AS coverImageId,
      s.revision,
      s.staff_edited AS staffEdited,
      s.created_at AS createdAt,
      s.updated_at AS updatedAt,
      s.submitted_at AS submittedAt,
      s.approved_at AS approvedAt,
      s.withdrawn_at AS withdrawnAt,
      s.removed_at AS removedAt,
      s.removed_previous_status AS removedPreviousStatus,
      s.removed_by_uuid AS removedByUuid,
      sm.public_reason AS publicReason,
      sm.private_note AS privateNote,
      sm.reviewed_by_uuid AS reviewedByUuid,
      sm.reviewed_at AS reviewedAt,
      sm.disqualified_at AS disqualifiedAt,
      sm.flag_reason AS flagReason,
      sm.flagged_by_uuid AS flaggedByUuid,
      sm.flagged_at AS flaggedAt
    FROM submissions s
    LEFT JOIN submission_moderation sm ON sm.submission_id = s.id
    WHERE s.competition_id = ?
      AND s.id = ?
    LIMIT 1
  `).bind(competitionId, submissionId).first();
  return row ? {
    ...row,
    staffEdited: Boolean(row.staffEdited),
    flagged: Boolean(row.flaggedAt)
  } : null;
}

export async function listStaffSubmissionModerationChecks(db, submissionId) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    SELECT
      id,
      target_type AS targetType,
      target_id AS targetId,
      provider,
      model,
      outcome,
      categories_json AS categoriesJson,
      scores_json AS scoresJson,
      content_hash AS contentHash,
      checked_at AS checkedAt
    FROM moderation_checks
    WHERE submission_id = ?
    ORDER BY checked_at DESC, id DESC
  `).bind(submissionId).all();
  return rows(result).map((row) => ({
    ...row,
    categories: JSON.parse(row.categoriesJson),
    scores: JSON.parse(row.scoresJson),
    categoriesJson: undefined,
    scoresJson: undefined
  }));
}

export async function setSubmissionFlag(db, flag) {
  const database = requireWritableDatabase(db);
  const flagged = Boolean(flag.flagged);
  if (flagged && (typeof flag.reason !== "string" || !flag.reason.trim())) {
    throw new TypeError("A private flag reason is required");
  }
  const action = flagged ? "SUBMISSION_FLAGGED" : "SUBMISSION_FLAG_CLEARED";
  const reason = flagged ? flag.reason.trim() : null;
  const results = await database.batch([
    flagged
      ? database.prepare(`
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
          reason,
          flag.actorUuid,
          flag.changedAt,
          flag.submissionId,
          flag.competitionId
        )
      : database.prepare(`
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
        `).bind(flag.submissionId, flag.submissionId, flag.competitionId),
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
      action,
      JSON.stringify({ flagged, reason }),
      flagged ? reason : (flag.note ?? "Internal submission flag cleared"),
      flag.changedAt
    )
  ]);
  return Number(results?.[0]?.meta?.changes ?? 0) === 1;
}

export async function moderateSubmission(db, decision) {
  const database = requireWritableDatabase(db);
  const statusMap = {
    APPROVE: "APPROVED",
    NEEDS_CHANGES: "NEEDS_CHANGES",
    REJECT: "REJECTED",
    DISQUALIFY: "DISQUALIFIED"
  };
  const targetStatus = statusMap[decision.action];
  if (!targetStatus) throw new TypeError("Invalid submission moderation action");

  const allowedCurrent = decision.action === "DISQUALIFY"
    ? ["PENDING_REVIEW", "NEEDS_CHANGES", "APPROVED"]
    : ["PENDING_REVIEW"];
  const placeholders = allowedCurrent.map(() => "?").join(",");

  const results = await database.batch([
    database.prepare(`
      UPDATE submissions
      SET status = ?,
          approved_at = CASE WHEN ? IS NOT NULL THEN ? ELSE approved_at END,
          updated_at = ?
      WHERE id = ?
        AND competition_id = ?
        AND removed_at IS NULL
        AND status IN (${placeholders})
    `).bind(
      targetStatus,
      decision.action === "APPROVE" ? decision.reviewedAt : null,
      decision.action === "APPROVE" ? decision.reviewedAt : null,
      decision.reviewedAt,
      decision.submissionId,
      decision.competitionId,
      ...allowedCurrent
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
      decision.publicReason ?? null,
      decision.privateNote ?? null,
      decision.reviewerUuid,
      decision.reviewedAt,
      decision.action === "DISQUALIFY" ? decision.reviewedAt : null
    ),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, submission_id, actor_subject, actor_uuid,
        action, before_json, after_json, note, created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM submissions
        WHERE id = ? AND competition_id = ? AND status = ? AND updated_at = ?
      )
    `).bind(
      decision.auditEventId,
      decision.competitionId,
      decision.submissionId,
      decision.actorSubject,
      decision.reviewerUuid,
      `SUBMISSION_${decision.action}`,
      JSON.stringify({ status: decision.previousStatus }),
      JSON.stringify({ status: targetStatus }),
      decision.privateNote ?? decision.publicReason ?? `Submission ${decision.action.toLowerCase()}`,
      decision.reviewedAt,
      decision.submissionId,
      decision.competitionId,
      targetStatus,
      decision.reviewedAt
    )
  ]);

  return Number(results?.[0]?.meta?.changes ?? 0) === 1
    ? { status: "UPDATED", submissionStatus: targetStatus }
    : { status: "CONFLICT" };
}

export async function removeStaffSubmission(db, removal) {
  const database = requireWritableDatabase(db);
  const results = await database.batch([
    database.prepare(`
      UPDATE submissions
      SET removed_previous_status = status,
          status = 'REMOVED',
          removed_at = ?,
          removed_by_uuid = ?,
          updated_at = ?
      WHERE id = ?
        AND competition_id = ?
        AND removed_at IS NULL
    `).bind(removal.removedAt, removal.removedByUuid, removal.removedAt, removal.submissionId, removal.competitionId),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, submission_id, actor_subject, actor_uuid,
        action, after_json, note, created_at
      )
      SELECT ?, ?, ?, ?, ?, 'SUBMISSION_REMOVED', ?, ?, ?
      WHERE changes() = 1
    `).bind(
      removal.auditEventId,
      removal.competitionId,
      removal.submissionId,
      removal.actorSubject,
      removal.removedByUuid,
      JSON.stringify({ status: "REMOVED" }),
      removal.privateNote ?? "Submission removed by staff",
      removal.removedAt
    )
  ]);
  return Number(results?.[0]?.meta?.changes ?? 0) === 1;
}

export async function restoreStaffSubmission(db, restoration) {
  const database = requireWritableDatabase(db);
  const results = await database.batch([
    database.prepare(`
      UPDATE submissions
      SET status = removed_previous_status,
          removed_at = NULL,
          removed_by_uuid = NULL,
          removed_previous_status = NULL,
          updated_at = ?
      WHERE id = ?
        AND competition_id = ?
        AND removed_at IS NOT NULL
        AND removed_previous_status IS NOT NULL
    `).bind(restoration.restoredAt, restoration.submissionId, restoration.competitionId),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, submission_id, actor_subject, actor_uuid,
        action, after_json, note, created_at
      )
      SELECT ?, ?, ?, ?, ?, 'SUBMISSION_RESTORED', ?, ?, ?
      WHERE changes() = 1
    `).bind(
      restoration.auditEventId,
      restoration.competitionId,
      restoration.submissionId,
      restoration.actorSubject,
      restoration.restoredByUuid,
      JSON.stringify({ restored: true }),
      restoration.privateNote ?? "Submission restored by staff",
      restoration.restoredAt
    )
  ]);
  return Number(results?.[0]?.meta?.changes ?? 0) === 1;
}

export async function staffEditSubmission(db, edit) {
  const database = requireWritableDatabase(db);
  const nextRevision = edit.expectedRevision + 1;
  const results = await database.batch([
    database.prepare(`
      UPDATE submissions
      SET title = ?,
          description = ?,
          revision = ?,
          staff_edited = 1,
          updated_at = ?
      WHERE id = ?
        AND competition_id = ?
        AND revision = ?
        AND removed_at IS NULL
        AND status NOT IN ('WITHDRAWN','REMOVED')
    `).bind(
      edit.title,
      edit.description,
      nextRevision,
      edit.editedAt,
      edit.submissionId,
      edit.competitionId,
      edit.expectedRevision
    ),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, submission_id, actor_subject, actor_uuid,
        action, after_json, note, created_at
      )
      SELECT ?, ?, ?, ?, ?, 'SUBMISSION_STAFF_EDITED', ?, ?, ?
      WHERE changes() = 1
    `).bind(
      edit.auditEventId,
      edit.competitionId,
      edit.submissionId,
      edit.actorSubject,
      edit.editorUuid,
      JSON.stringify({ revision: nextRevision, staffEdited: true }),
      edit.privateNote ?? "Submission edited by staff",
      edit.editedAt
    )
  ]);
  return Number(results?.[0]?.meta?.changes ?? 0) === 1
    ? { status: "UPDATED", revision: nextRevision }
    : { status: "CONFLICT" };
}
