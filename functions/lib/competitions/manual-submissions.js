function requireWritableDatabase(db) {
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new TypeError("Competition database binding is not writable");
  }
  return db;
}

export async function createManualSoloSubmission(db, submission) {
  const database = requireWritableDatabase(db);
  const statements = [
    database.prepare(`
      INSERT INTO submissions (
        id, competition_id, entry_type, status, owner_subject, owner_uuid,
        owner_name, guild_id, guild_name_snapshot, title, description,
        revision, staff_edited, created_at, updated_at, submitted_at
      ) VALUES (?, ?, 'SOLO', 'PENDING_REVIEW', ?, ?, ?, NULL, NULL, ?, ?, 1, 1, ?, ?, ?)
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
      submission.createdAt
    ),
    database.prepare(`
      INSERT INTO submission_participants (
        submission_id, player_uuid, player_name, participant_role,
        invite_status, invited_by_uuid, invited_at, responded_at
      ) VALUES (?, ?, ?, 'OWNER', 'ACCEPTED', ?, ?, ?)
    `).bind(
      submission.id,
      submission.ownerUuid,
      submission.ownerName,
      submission.actorUuid,
      submission.createdAt,
      submission.createdAt
    )
  ];

  if (submission.location) {
    statements.push(database.prepare(`
      INSERT INTO submission_private_locations (
        submission_id, world_name, block_x, block_y, block_z,
        exact_coordinates_confirmed, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?)
    `).bind(
      submission.id,
      submission.location.worldName,
      submission.location.x,
      submission.location.y,
      submission.location.z,
      submission.createdAt
    ));
  }

  for (const check of submission.moderationChecks ?? []) {
    statements.push(database.prepare(`
      INSERT INTO moderation_checks (
        id, competition_id, submission_id, target_type, target_id,
        provider, model, outcome, categories_json, scores_json,
        content_hash, checked_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
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
      submission.createdAt
    ));
  }

  statements.push(
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, submission_id, actor_subject, actor_uuid,
        action, after_json, note, created_at
      ) VALUES (?, ?, ?, ?, ?, 'SUBMISSION_MANUAL_CREATED', ?, ?, ?)
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
      submission.createdAt
    ),
    database.prepare(`
      INSERT INTO competition_notification_outbox (
        id, competition_id, submission_id, event_type, recipient_uuid,
        operation_key, payload_json, state, attempts, next_attempt_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'SUBMISSION_REVIEW', NULL, ?, ?, 'PENDING', 0, ?, ?, ?)
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
      submission.createdAt
    )
  );

  await database.batch(statements);
  return submission.id;
}
