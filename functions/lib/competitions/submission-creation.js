function requireWritableDatabase(db) {
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new TypeError("Competition database binding is not writable");
  }
  return db;
}

const DRAFT_CREATION_GUARD_SQL = `EXISTS (
  SELECT 1
  FROM competitions competition
  JOIN competition_config_versions config
    ON config.competition_id = competition.id
   AND config.version = competition.current_config_version
  WHERE competition.id = ?
    AND competition.current_config_version = ?
    AND competition.lifecycle_state = 'SUBMISSIONS_OPEN'
    AND EXISTS (
      SELECT 1
      FROM json_each(config.config_json, '$.entries.allowedTypes') allowed
      WHERE allowed.value = ?
    )
    AND (
      (
        ? = 'GUILD'
        AND (
          SELECT COUNT(*)
          FROM submissions existing
          WHERE existing.competition_id = competition.id
            AND existing.guild_id = ?
            AND existing.entry_type = 'GUILD'
            AND existing.status NOT IN ('WITHDRAWN','REMOVED','REJECTED','DISQUALIFIED')
            AND existing.removed_at IS NULL
        ) < COALESCE(
          CAST(json_extract(config.config_json, '$.entries.maxEntriesPerGuild') AS INTEGER),
          1
        )
      )
      OR
      (
        ? <> 'GUILD'
        AND (
          WITH identity_uuids AS (
            SELECT ? AS minecraft_uuid
            UNION
            SELECT link.minecraft_uuid
            FROM competition_minecraft_links link
            WHERE link.discord_user_id = substr(?, 9)
            UNION
            SELECT identity_lock.minecraft_uuid
            FROM competition_minecraft_identity_locks identity_lock
            WHERE identity_lock.discord_user_id = substr(?, 9)
          ), slot_rows AS (
            SELECT existing.id AS submission_id
            FROM submissions existing
            WHERE existing.competition_id = competition.id
              AND (
                existing.owner_subject = ?
                OR existing.owner_uuid IN (SELECT minecraft_uuid FROM identity_uuids)
              )
              AND existing.entry_type IN ('SOLO','GROUP')
              AND existing.status NOT IN ('WITHDRAWN','REMOVED','REJECTED','DISQUALIFIED')
              AND existing.removed_at IS NULL
            UNION
            SELECT participant.submission_id
            FROM submission_participants participant
            JOIN submissions existing ON existing.id = participant.submission_id
            WHERE existing.competition_id = competition.id
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
      )
    )
)`;

const CREATED_DRAFT_SQL = `EXISTS (
  SELECT 1
  FROM submissions created
  WHERE created.id = ?
    AND created.competition_id = ?
    AND created.owner_subject = ?
    AND created.created_at = ?
    AND created.revision = 1
    AND created.status = 'DRAFT'
)`;

function createdDraftBindings(draft) {
  return [draft.id, draft.competitionId, draft.ownerSubject, draft.createdAt];
}

function draftStatement(database, draft) {
  return database.prepare(`
    INSERT INTO submissions (
      id, competition_id, entry_type, status, owner_subject, owner_uuid,
      owner_name, guild_id, guild_name_snapshot, title, description,
      revision, staff_edited, created_at, updated_at
    )
    SELECT ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?
    WHERE ${DRAFT_CREATION_GUARD_SQL}
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
    draft.createdAt,
    draft.competitionId,
    draft.expectedConfigVersion,
    draft.entryType,
    draft.entryType,
    draft.guildId ?? null,
    draft.entryType,
    draft.ownerUuid,
    draft.ownerSubject,
    draft.ownerSubject,
    draft.ownerSubject
  );
}

function ownerParticipantStatement(database, draft) {
  return database.prepare(`
    INSERT INTO submission_participants (
      submission_id, player_uuid, player_name, participant_role,
      invite_status, invited_by_uuid, invited_at, responded_at
    )
    SELECT ?, ?, ?, 'OWNER', 'ACCEPTED', ?, ?, ?
    WHERE ${CREATED_DRAFT_SQL}
  `).bind(
    draft.id,
    draft.ownerUuid,
    draft.ownerName,
    draft.ownerUuid,
    draft.createdAt,
    draft.createdAt,
    ...createdDraftBindings(draft)
  );
}

function locationStatement(database, draft) {
  return database.prepare(`
    INSERT INTO submission_private_locations (
      submission_id, world_name, block_x, block_y, block_z,
      exact_coordinates_confirmed, updated_at
    )
    SELECT ?, ?, ?, ?, ?, ?, ?
    WHERE ${CREATED_DRAFT_SQL}
  `).bind(
    draft.id,
    draft.location.worldName,
    draft.location.x,
    draft.location.y,
    draft.location.z,
    draft.location.exactCoordinatesConfirmed ? 1 : 0,
    draft.createdAt,
    ...createdDraftBindings(draft)
  );
}

function auditStatement(database, draft) {
  return database.prepare(`
    INSERT INTO competition_audit_events (
      id, competition_id, submission_id, actor_subject, actor_uuid,
      action, after_json, note, created_at
    )
    SELECT ?, ?, ?, ?, ?, 'SUBMISSION_DRAFT_CREATED', ?, ?, ?
    WHERE ${CREATED_DRAFT_SQL}
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
    draft.createdAt,
    ...createdDraftBindings(draft)
  );
}

function draftStatements(database, draft) {
  const statements = [draftStatement(database, draft)];
  if (draft.entryType !== "GUILD") {
    statements.push(ownerParticipantStatement(database, draft));
  }
  if (draft.location) statements.push(locationStatement(database, draft));
  statements.push(auditStatement(database, draft));
  return statements;
}

function creationResult(results, draftId) {
  return Number(results?.[0]?.meta?.changes ?? 0) === 1
    ? { status: "CREATED", id: draftId }
    : { status: "CONFLICT" };
}

export async function createSubmissionDraft(db, draft) {
  const database = requireWritableDatabase(db);
  const results = await database.batch(draftStatements(database, draft));
  return creationResult(results, draft.id);
}
