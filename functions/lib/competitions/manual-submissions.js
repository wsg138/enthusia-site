function requireWritableDatabase(db) {
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new TypeError("Competition database binding is not writable");
  }
  return db;
}

const MANUAL_SUBMISSION_GUARD_SQL = `EXISTS (
  SELECT 1
  FROM competitions competition
  JOIN competition_config_versions config
    ON config.competition_id = competition.id
   AND config.version = competition.current_config_version
  WHERE competition.id = ?
    AND competition.current_config_version = ?
    AND competition.lifecycle_state IN ('SUBMISSIONS_OPEN','REVIEW')
    AND EXISTS (
      SELECT 1
      FROM json_each(config.config_json, '$.entries.allowedTypes') allowed
      WHERE allowed.value = 'SOLO'
    )
    AND (
      WITH discord_ids AS (
        SELECT discord_user_id
        FROM competition_minecraft_links
        WHERE minecraft_uuid = ?
        UNION
        SELECT discord_user_id
        FROM competition_minecraft_identity_locks
        WHERE minecraft_uuid = ?
      ), identity_uuids AS (
        SELECT ? AS minecraft_uuid
        UNION
        SELECT link.minecraft_uuid
        FROM competition_minecraft_links link
        WHERE link.discord_user_id IN (SELECT discord_user_id FROM discord_ids)
        UNION
        SELECT identity_lock.minecraft_uuid
        FROM competition_minecraft_identity_locks identity_lock
        WHERE identity_lock.discord_user_id IN (SELECT discord_user_id FROM discord_ids)
      ), slot_rows AS (
        SELECT existing.id AS submission_id
        FROM submissions existing
        WHERE existing.competition_id = ?
          AND existing.owner_uuid IN (SELECT minecraft_uuid FROM identity_uuids)
          AND existing.entry_type IN ('SOLO','GROUP')
          AND existing.status NOT IN ('WITHDRAWN','REMOVED','REJECTED','DISQUALIFIED')
          AND existing.removed_at IS NULL
        UNION
        SELECT participant.submission_id
        FROM submission_participants participant
        JOIN submissions existing ON existing.id = participant.submission_id
        WHERE existing.competition_id = ?
          AND participant.player_uuid IN (SELECT minecraft_uuid FROM identity_uuids)
          AND participant.invite_status = 'ACCEPTED'
          AND participant.participant_role = 'MAIN'
          AND existing.entry_type = 'GROUP'
          AND existing.status NOT IN ('WITHDRAWN','REMOVED','REJECTED','DISQUALIFIED')
          AND existing.removed_at IS NULL
      )
      SELECT COUNT(DISTINCT submission_id) FROM slot_rows
    ) < COALESCE(
      CAST(json_extract(config.config_json, '$.entries.maxEntriesPerPlayer') AS INTEGER),
      1
    )
)`;

const CREATED_SUBMISSION_SQL = `EXISTS (
  SELECT 1
  FROM submissions created
  WHERE created.id = ?
    AND created.competition_id = ?
    AND created.owner_subject = ?
    AND created.revision = 1
    AND created.status = 'PENDING_REVIEW'
)`;

function submissionStatement(database, submission) {
  return database.prepare(`
    INSERT INTO submissions (
      id, competition_id, entry_type, status, owner_subject, owner_uuid,
      owner_name, guild_id, guild_name_snapshot, title, description,
      revision, staff_edited, created_at, updated_at, submitted_at
    )
    SELECT ?, ?, 'SOLO', 'PENDING_REVIEW', ?, ?, ?, NULL, NULL, ?, ?, 1, 1, ?, ?, ?
    WHERE ${MANUAL_SUBMISSION_GUARD_SQL}
  `).bind(
    submission.id,
    submission.competitionId,
    submission.ownerSubject,
    submission.ownerUuid,
    submission.ownerName,
    submission.title,
    submission.description,
    submission.createdAt,
    submission.createdAt,
    submission.createdAt,
    submission.competitionId,
    submission.expectedConfigVersion,
    submission.ownerUuid,
    submission.ownerUuid,
    submission.ownerUuid,
    submission.competitionId,
    submission.competitionId
  );
}

function createdSubmissionBindings(submission) {
  return [submission.id, submission.competitionId, submission.ownerSubject];
}

function ownerParticipantStatement(database, submission) {
  return database.prepare(`
    INSERT INTO submission_participants (
      submission_id, player_uuid, player_name, participant_role,
      invite_status, invited_by_uuid, invited_at, responded_at
    )
    SELECT ?, ?, ?, 'OWNER', 'ACCEPTED', ?, ?, ?
    WHERE ${CREATED_SUBMISSION_SQL}
  `).bind(
    submission.id,
    submission.ownerUuid,
    submission.ownerName,
    submission.actorUuid,
    submission.createdAt,
    submission.createdAt,
    ...createdSubmissionBindings(submission)
  );
}

function locationStatement(database, submission) {
  return database.prepare(`
    INSERT INTO submission_private_locations (
      submission_id, world_name, block_x, block_y, block_z,
      exact_coordinates_confirmed, updated_at
    )
    SELECT ?, ?, ?, ?, ?, 1, ?
    WHERE ${CREATED_SUBMISSION_SQL}
  `).bind(
    submission.id,
    submission.location.worldName,
    submission.location.x,
    submission.location.y,
    submission.location.z,
    submission.createdAt,
    ...createdSubmissionBindings(submission)
  );
}

function moderationStatement(database, submission, check) {
  return database.prepare(`
    INSERT INTO moderation_checks (
      id, competition_id, submission_id, target_type, target_id,
      provider, model, outcome, categories_json, scores_json,
      content_hash, checked_at
    )
    SELECT ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?
    WHERE ${CREATED_SUBMISSION_SQL}
  `).bind(
    check.id,
    submission.competitionId,
    submission.id,
    check.targetType,
    check.provider,
    check.model,
    check.outcome,
    JSON.stringify(check.categories ?? {}),
    JSON.stringify(check.scores ?? {}),
    check.contentHash,
    submission.createdAt,
    ...createdSubmissionBindings(submission)
  );
}

function auditStatement(database, submission) {
  return database.prepare(`
    INSERT INTO competition_audit_events (
      id, competition_id, submission_id, actor_subject, actor_uuid,
      action, after_json, note, created_at
    )
    SELECT ?, ?, ?, ?, ?, 'SUBMISSION_MANUAL_CREATED', ?, ?, ?
    WHERE ${CREATED_SUBMISSION_SQL}
  `).bind(
    submission.auditEventId,
    submission.competitionId,
    submission.id,
    submission.actorSubject,
    submission.actorUuid,
    JSON.stringify({
      ownerUuid: submission.ownerUuid,
      ownerName: submission.ownerName,
      status: "PENDING_REVIEW",
      staffManaged: true
    }),
    submission.note ?? "Staff created a submission for a player",
    submission.createdAt,
    ...createdSubmissionBindings(submission)
  );
}

function notificationStatement(database, submission) {
  return database.prepare(`
    INSERT INTO competition_notification_outbox (
      id, competition_id, submission_id, event_type, recipient_uuid,
      operation_key, payload_json, state, attempts, next_attempt_at,
      created_at, updated_at
    )
    SELECT ?, ?, ?, 'SUBMISSION_REVIEW', NULL, ?, ?, 'PENDING', 0, ?, ?, ?
    WHERE ${CREATED_SUBMISSION_SQL}
    ON CONFLICT(operation_key) DO NOTHING
  `).bind(
    submission.notificationId,
    submission.competitionId,
    submission.id,
    `submission-review:${submission.id}:1`,
    JSON.stringify({
      competitionTitle: submission.competitionTitle,
      competitionSlug: submission.competitionSlug,
      submissionTitle: submission.title,
      ownerName: submission.ownerName,
      submissionId: submission.id
    }),
    submission.createdAt,
    submission.createdAt,
    submission.createdAt,
    ...createdSubmissionBindings(submission)
  );
}

function batchStatements(database, submission) {
  const statements = [
    submissionStatement(database, submission),
    ownerParticipantStatement(database, submission)
  ];
  if (submission.location) statements.push(locationStatement(database, submission));
  const moderationChecks = submission.moderationChecks || [];
  for (const check of moderationChecks) {
    statements.push(moderationStatement(database, submission, check));
  }
  statements.push(
    auditStatement(database, submission),
    notificationStatement(database, submission)
  );
  return statements;
}

function creationResult(results, submissionId) {
  return Number(results?.[0]?.meta?.changes ?? 0) === 1
    ? { status: "CREATED", id: submissionId }
    : { status: "CONFLICT" };
}

export async function createManualSoloSubmission(db, submission) {
  const database = requireWritableDatabase(db);
  const results = await database.batch(batchStatements(database, submission));
  return creationResult(results, submission.id);
}
