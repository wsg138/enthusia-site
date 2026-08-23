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
  const placeholders = uuids.map(() => "?").join(",");
  const row = await database.prepare(`
    SELECT COUNT(DISTINCT submission_id) AS entryCount
    FROM (
      SELECT s.id AS submission_id
      FROM submissions s
      WHERE s.competition_id = ?
        AND s.owner_uuid IN (${placeholders})
        AND s.entry_type IN ('SOLO','GROUP')
        AND s.status NOT IN ('WITHDRAWN','REMOVED','REJECTED','DISQUALIFIED')
        AND s.removed_at IS NULL
      UNION
      SELECT p.submission_id
      FROM submission_participants p
      JOIN submissions s ON s.id = p.submission_id
      WHERE s.competition_id = ?
        AND p.player_uuid IN (${placeholders})
        AND p.invite_status = 'ACCEPTED'
        AND p.participant_role = 'MAIN'
        AND s.entry_type = 'GROUP'
        AND s.status NOT IN ('WITHDRAWN','REMOVED','REJECTED','DISQUALIFIED')
        AND s.removed_at IS NULL
    )
  `).bind(competitionId, ...uuids, competitionId, ...uuids).first();
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

export async function createSubmissionDraft(db, draft) {
  const database = requireWritableDatabase(db);
  const statements = [
    database.prepare(`
      INSERT INTO submissions (
        id, competition_id, entry_type, status, owner_subject, owner_uuid,
        owner_name, guild_id, guild_name_snapshot, title, description,
        revision, staff_edited, created_at, updated_at
      ) VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
    `).bind(
      draft.id,
      draft.competitionId,
      draft.entryType,
      draft.ownerSubject,
      draft.ownerUuid,
      draft.ownerName,
      draft.guildId ?? null,
      draft.guildName ?? null,
      draft.title,
      draft.description,
      draft.createdAt,
      draft.createdAt
    )
  ];

  if (draft.entryType !== "GUILD") {
    statements.push(database.prepare(`
      INSERT INTO submission_participants (
        submission_id, player_uuid, player_name, participant_role,
        invite_status, invited_by_uuid, invited_at, responded_at
      ) VALUES (?, ?, ?, 'OWNER', 'ACCEPTED', ?, ?, ?)
    `).bind(
      draft.id,
      draft.ownerUuid,
      draft.ownerName,
      draft.ownerUuid,
      draft.createdAt,
      draft.createdAt
    ));
  }

  if (draft.location) {
    statements.push(database.prepare(`
      INSERT INTO submission_private_locations (
        submission_id, world_name, block_x, block_y, block_z,
        exact_coordinates_confirmed, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      draft.id,
      draft.location.worldName,
      draft.location.x,
      draft.location.y,
      draft.location.z,
      draft.location.exactCoordinatesConfirmed ? 1 : 0,
      draft.createdAt
    ));
  }

  statements.push(database.prepare(`
    INSERT INTO competition_audit_events (
      id, competition_id, submission_id, actor_subject, actor_uuid,
      action, after_json, note, created_at
    ) VALUES (?, ?, ?, ?, ?, 'SUBMISSION_DRAFT_CREATED', ?, ?, ?)
  `).bind(
    draft.auditEventId,
    draft.competitionId,
    draft.id,
    draft.ownerSubject,
    draft.ownerUuid,
    JSON.stringify({
      entryType: draft.entryType,
      ownerUuid: draft.ownerUuid,
      guildId: draft.guildId ?? null,
      revision: 1
    }),
    "Submission draft created",
    draft.createdAt
  ));

  await database.batch(statements);
  return draft.id;
}

export async function updateSubmissionDraft(db, update) {
  const database = requireWritableDatabase(db);
  const nextRevision = update.expectedRevision + 1;
  const statements = [
    database.prepare(`
      UPDATE submissions
      SET title = ?,
          description = ?,
          revision = ?,
          updated_at = ?
      WHERE id = ?
        AND competition_id = ?
        AND owner_subject = ?
        AND revision = ?
        AND status IN ('DRAFT','NEEDS_CHANGES')
        AND removed_at IS NULL
    `).bind(
      update.title,
      update.description,
      nextRevision,
      update.updatedAt,
      update.submissionId,
      update.competitionId,
      update.ownerSubject,
      update.expectedRevision
    )
  ];

  if (update.location) {
    statements.push(database.prepare(`
      INSERT INTO submission_private_locations (
        submission_id, world_name, block_x, block_y, block_z,
        exact_coordinates_confirmed, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE changes() = 1
      ON CONFLICT(submission_id) DO UPDATE SET
        world_name = excluded.world_name,
        block_x = excluded.block_x,
        block_y = excluded.block_y,
        block_z = excluded.block_z,
        exact_coordinates_confirmed = excluded.exact_coordinates_confirmed,
        updated_at = excluded.updated_at
    `).bind(
      update.submissionId,
      update.location.worldName,
      update.location.x,
      update.location.y,
      update.location.z,
      update.location.exactCoordinatesConfirmed ? 1 : 0,
      update.updatedAt
    ));
  } else if (update.clearLocation) {
    statements.push(database.prepare(`
      DELETE FROM submission_private_locations
      WHERE submission_id = ?
        AND changes() = 1
    `).bind(update.submissionId));
  }

  statements.push(database.prepare(`
    INSERT INTO competition_audit_events (
      id, competition_id, submission_id, actor_subject, actor_uuid,
      action, after_json, note, created_at
    )
    SELECT ?, ?, ?, ?, ?, 'SUBMISSION_UPDATED', ?, ?, ?
    WHERE changes() = 1
  `).bind(
    update.auditEventId,
    update.competitionId,
    update.submissionId,
    update.ownerSubject,
    update.actorUuid,
    JSON.stringify({ revision: nextRevision }),
    update.note ?? "Submission updated",
    update.updatedAt
  ));

  const results = await database.batch(statements);
  return Number(results?.[0]?.meta?.changes ?? 0) === 1
    ? { status: "UPDATED", revision: nextRevision }
    : { status: "CONFLICT" };
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

export async function submitSubmissionForReview(db, submission) {
  const database = requireWritableDatabase(db);
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
    `).bind(
      nextRevision,
      submission.submittedAt,
      submission.submittedAt,
      submission.submissionId,
      submission.competitionId,
      submission.ownerSubject,
      submission.expectedRevision
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
      submission.submittedAt
    )
  ]);
  return Number(results?.[0]?.meta?.changes ?? 0) === 1
    ? { status: "SUBMITTED", revision: nextRevision }
    : { status: "CONFLICT" };
}

export async function withdrawSubmission(db, withdrawal) {
  const database = requireWritableDatabase(db);
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
    `).bind(now, now, withdrawal.submissionId, withdrawal.competitionId, withdrawal.ownerSubject),
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
