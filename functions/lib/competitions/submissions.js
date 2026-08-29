import {
  OWNER_SUBMISSION_EDIT_GUARD_SQL,
  OWNER_SUBMISSION_WITHDRAW_GUARD_SQL,
  ownerSubmissionEditPolicy,
  ownerSubmissionWithdrawPolicy
} from "./submission-edit-policy.js";

function requireDatabase(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("Competition database binding is unavailable");
  }
  return db;
}

function requireWritableDatabase(db) {
  const database = requireDatabase(db);
  if (typeof database.batch !== "function") {
    throw new TypeError("Competition database binding is not writable");
  }
  return database;
}

function rows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function normalizedPlayerUuids(playerUuids) {
  const values = [...new Set((Array.isArray(playerUuids) ? playerUuids : [playerUuids])
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean))];
  if (!values.length) throw new TypeError("At least one Minecraft UUID is required");
  if (values.length > 32) throw new TypeError("Too many Minecraft UUIDs");
  return values;
}

export async function countLinkedPlayerEntrySlots(db, competitionId, playerUuids) {
  const database = requireDatabase(db);
  const uuids = normalizedPlayerUuids(playerUuids);
  const values = uuids.map(() => "(?)").join(",");
  const row = await database.prepare(`
    WITH seed_uuids(minecraft_uuid) AS (VALUES ${values}),
    discord_ids AS (
      SELECT l.discord_user_id
      FROM competition_minecraft_links l
      JOIN seed_uuids seed ON seed.minecraft_uuid = l.minecraft_uuid
      UNION
      SELECT lock.discord_user_id
      FROM competition_minecraft_identity_locks lock
      JOIN seed_uuids seed ON seed.minecraft_uuid = lock.minecraft_uuid
    ),
    identity_uuids AS (
      SELECT minecraft_uuid FROM seed_uuids
      UNION
      SELECT l.minecraft_uuid
      FROM competition_minecraft_links l
      WHERE l.discord_user_id IN (SELECT discord_user_id FROM discord_ids)
      UNION
      SELECT lock.minecraft_uuid
      FROM competition_minecraft_identity_locks lock
      WHERE lock.discord_user_id IN (SELECT discord_user_id FROM discord_ids)
    ),
    slot_rows AS (
      SELECT s.id AS submission_id
      FROM submissions s
      WHERE s.competition_id = ?
        AND s.owner_uuid IN (SELECT minecraft_uuid FROM identity_uuids)
        AND s.entry_type IN ('SOLO','GROUP')
        AND s.status NOT IN ('WITHDRAWN','REMOVED','REJECTED','DISQUALIFIED')
        AND s.removed_at IS NULL
      UNION
      SELECT p.submission_id
      FROM submission_participants p
      JOIN submissions s ON s.id = p.submission_id
      WHERE s.competition_id = ?
        AND p.player_uuid IN (SELECT minecraft_uuid FROM identity_uuids)
        AND p.invite_status = 'ACCEPTED'
        AND p.participant_role = 'MAIN'
        AND s.entry_type = 'GROUP'
        AND s.status NOT IN ('WITHDRAWN','REMOVED','REJECTED','DISQUALIFIED')
        AND s.removed_at IS NULL
    )
    SELECT COUNT(DISTINCT submission_id) AS entryCount
    FROM slot_rows
  `).bind(...uuids, competitionId, competitionId).first();
  return Number(row?.entryCount ?? 0);
}

export async function countPlayerEntrySlots(db, competitionId, playerUuid) {
  return countLinkedPlayerEntrySlots(db, competitionId, [playerUuid]);
}

export async function countGuildEntries(db, competitionId, guildId) {
  const database = requireDatabase(db);
  const row = await database.prepare(`
    SELECT COUNT(*) AS entryCount
    FROM submissions
    WHERE competition_id = ?
      AND guild_id = ?
      AND entry_type = 'GUILD'
      AND status NOT IN ('WITHDRAWN','REMOVED','REJECTED','DISQUALIFIED')
      AND removed_at IS NULL
  `).bind(competitionId, guildId).first();
  return Number(row?.entryCount ?? 0);
}

export async function listAccountSubmissions(db, competitionId, ownerSubject) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    SELECT
      id,
      competition_id AS competitionId,
      entry_type AS entryType,
      status,
      owner_uuid AS ownerUuid,
      owner_name AS ownerName,
      guild_id AS guildId,
      guild_name_snapshot AS guildName,
      title,
      description,
      cover_image_id AS coverImageId,
      revision,
      staff_edited AS staffEdited,
      created_at AS createdAt,
      updated_at AS updatedAt,
      submitted_at AS submittedAt,
      approved_at AS approvedAt,
      withdrawn_at AS withdrawnAt
    FROM submissions
    WHERE competition_id = ?
      AND owner_subject = ?
      AND removed_at IS NULL
    ORDER BY created_at ASC, id ASC
  `).bind(competitionId, ownerSubject).all();
  return rows(result).map((row) => ({ ...row, staffEdited: Boolean(row.staffEdited) }));
}

export async function getAccountSubmission(db, competitionId, submissionId, ownerSubject) {
  const database = requireDatabase(db);
  const row = await database.prepare(`
    SELECT
      id,
      competition_id AS competitionId,
      entry_type AS entryType,
      status,
      owner_uuid AS ownerUuid,
      owner_name AS ownerName,
      guild_id AS guildId,
      guild_name_snapshot AS guildName,
      title,
      description,
      cover_image_id AS coverImageId,
      revision,
      staff_edited AS staffEdited,
      created_at AS createdAt,
      updated_at AS updatedAt,
      submitted_at AS submittedAt,
      approved_at AS approvedAt,
      withdrawn_at AS withdrawnAt
    FROM submissions
    WHERE competition_id = ?
      AND id = ?
      AND owner_subject = ?
      AND removed_at IS NULL
    LIMIT 1
  `).bind(competitionId, submissionId, ownerSubject).first();
  return row ? { ...row, staffEdited: Boolean(row.staffEdited) } : null;
}

export async function getSubmissionLocation(db, submissionId) {
  const database = requireDatabase(db);
  const row = await database.prepare(`
    SELECT
      world_name AS worldName,
      block_x AS x,
      block_y AS y,
      block_z AS z,
      exact_coordinates_confirmed AS exactCoordinatesConfirmed,
      updated_at AS updatedAt
    FROM submission_private_locations
    WHERE submission_id = ?
    LIMIT 1
  `).bind(submissionId).first();
  return row ? { ...row, exactCoordinatesConfirmed: Boolean(row.exactCoordinatesConfirmed) } : null;
}

export async function listSubmissionParticipants(db, submissionId) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    SELECT
      player_uuid AS playerUuid,
      player_name AS playerName,
      participant_role AS role,
      invite_status AS inviteStatus,
      invited_by_uuid AS invitedByUuid,
      invited_at AS invitedAt,
      responded_at AS respondedAt
    FROM submission_participants
    WHERE submission_id = ?
    ORDER BY
      CASE participant_role WHEN 'OWNER' THEN 1 WHEN 'MAIN' THEN 2 WHEN 'GUILD_WORKER' THEN 3 ELSE 4 END,
      player_name COLLATE NOCASE ASC
  `).bind(submissionId).all();
  return rows(result);
}

export async function listSubmissionImages(db, submissionId) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    SELECT
      id,
      sort_order AS sortOrder,
      mime_type AS mimeType,
      byte_size AS byteSize,
      width,
      height,
      moderation_state AS moderationState,
      created_at AS createdAt
    FROM submission_images
    WHERE submission_id = ?
      AND removed_at IS NULL
    ORDER BY sort_order ASC, id ASC
  `).bind(submissionId).all();
  return rows(result);
}

export async function recordTextModerationChecks(db, checks) {
  const database = requireWritableDatabase(db);
  const statements = checks.map((check) => database.prepare(`
    INSERT INTO moderation_checks (
      id, competition_id, submission_id, target_type, target_id,
      provider, model, outcome, categories_json, scores_json,
      content_hash, checked_at
    ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    check.id,
    check.competitionId,
    check.submissionId,
    check.targetType,
    check.provider,
    check.model,
    check.outcome,
    JSON.stringify(check.categories ?? {}),
    JSON.stringify(check.scores ?? {}),
    check.contentHash,
    check.checkedAt
  ));
  if (!statements.length) return;
  await database.batch(statements);
}

function submissionReviewWritePolicy(submission) {
  const policy = ownerSubmissionEditPolicy({
    expectedConfigVersion: submission.expectedConfigVersion,
    operationAt: submission.submittedAt,
    reviewCloseAt: submission.reviewCloseAt
  });
  if (!Number.isInteger(submission.minImages) || submission.minImages < 0) {
    throw new TypeError("Minimum submission image count is invalid");
  }
  if (typeof submission.coordinatesRequested !== "boolean") {
    throw new TypeError("Submission coordinate requirement is invalid");
  }
  return {
    configVersion: policy.configVersion,
    operationAt: policy.operationAt,
    reviewCloseAt: policy.reviewCloseAt,
    minImages: submission.minImages,
    coordinatesRequested: submission.coordinatesRequested ? 1 : 0
  };
}

export async function submitSubmissionForReview(db, submission) {
  const database = requireWritableDatabase(db);
  const policy = submissionReviewWritePolicy(submission);
  const nextRevision = submission.expectedRevision + 1;
  const results = await database.batch([
    database.prepare(`
      UPDATE submissions
      SET status = 'PENDING_REVIEW',
          revision = ?,
          submitted_at = ?,
          updated_at = ?
      WHERE id = ?
        AND competition_id = ?
        AND owner_subject = ?
        AND revision = ?
        AND status IN ('DRAFT','NEEDS_CHANGES')
        AND removed_at IS NULL
        AND ${OWNER_SUBMISSION_EDIT_GUARD_SQL}
        AND (
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
    `).bind(
      nextRevision,
      policy.operationAt,
      policy.operationAt,
      submission.submissionId,
      submission.competitionId,
      submission.ownerSubject,
      submission.expectedRevision,
      policy.configVersion,
      policy.reviewCloseAt,
      policy.operationAt,
      policy.reviewCloseAt,
      policy.minImages,
      policy.coordinatesRequested
    ),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, submission_id, actor_subject, actor_uuid,
        action, after_json, note, created_at
      )
      SELECT ?, ?, ?, ?, ?, 'SUBMISSION_SENT_FOR_REVIEW', ?, ?, ?
      WHERE changes() = 1
    `).bind(
      submission.auditEventId,
      submission.competitionId,
      submission.submissionId,
      submission.ownerSubject,
      submission.actorUuid,
      JSON.stringify({ status: "PENDING_REVIEW", revision: nextRevision }),
      "Submission sent for staff review",
      policy.operationAt
    )
  ]);
  return Number(results?.[0]?.meta?.changes ?? 0) === 1
    ? { status: "SUBMITTED", revision: nextRevision }
    : { status: "CONFLICT" };
}

export async function withdrawSubmission(db, withdrawal) {
  const database = requireWritableDatabase(db);
  const policy = ownerSubmissionWithdrawPolicy(withdrawal.expectedConfigVersion);
  const now = withdrawal.withdrawnAt;
  const results = await database.batch([
    database.prepare(`
      UPDATE submissions
      SET status = 'WITHDRAWN',
          withdrawn_at = ?,
          updated_at = ?
      WHERE id = ?
        AND competition_id = ?
        AND owner_subject = ?
        AND status IN ('DRAFT','PENDING_REVIEW','NEEDS_CHANGES','APPROVED')
        AND removed_at IS NULL
        AND ${OWNER_SUBMISSION_WITHDRAW_GUARD_SQL}
    `).bind(
      now,
      now,
      withdrawal.submissionId,
      withdrawal.competitionId,
      withdrawal.ownerSubject,
      policy.configVersion
    ),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, submission_id, actor_subject, actor_uuid,
        action, after_json, note, created_at
      )
      SELECT ?, ?, ?, ?, ?, 'SUBMISSION_WITHDRAWN', ?, ?, ?
      WHERE changes() = 1
    `).bind(
      withdrawal.auditEventId,
      withdrawal.competitionId,
      withdrawal.submissionId,
      withdrawal.ownerSubject,
      withdrawal.actorUuid,
      JSON.stringify({ status: "WITHDRAWN" }),
      "Submission withdrawn by entrant",
      now
    )
  ]);
  return Number(results?.[0]?.meta?.changes ?? 0) === 1;
}

export { normalizedPlayerUuids };
