function requireDatabase(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("Competition database binding is unavailable");
  }
  return db;
}

function rows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

export async function competitionSchemaReady(db) {
  const database = requireDatabase(db);
  const row = await database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .bind("competitions")
    .first();
  return row?.name === "competitions";
}

export async function listPublicCompetitions(db) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    SELECT
      id,
      slug,
      title,
      category,
      lifecycle_state AS lifecycleState,
      current_config_version AS configVersion,
      published_at AS publishedAt,
      archived_at AS archivedAt
    FROM competitions
    WHERE published_at IS NOT NULL
      AND lifecycle_state NOT IN ('DRAFT', 'CANCELLED')
    ORDER BY
      CASE lifecycle_state
        WHEN 'SUBMISSIONS_OPEN' THEN 1
        WHEN 'REVIEW' THEN 2
        WHEN 'VOTING' THEN 3
        WHEN 'JUDGING' THEN 4
        WHEN 'RESULTS_READY' THEN 5
        WHEN 'UPCOMING' THEN 6
        WHEN 'COMPLETED' THEN 7
        WHEN 'ARCHIVED' THEN 8
        ELSE 9
      END,
      published_at DESC
  `).all();
  return rows(result);
}

export async function listApprovedPublicSubmissions(db, competitionId) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    SELECT
      id,
      competition_id AS competitionId,
      entry_type AS entryType,
      owner_uuid AS ownerUuid,
      owner_name AS ownerName,
      guild_id AS guildId,
      guild_name_snapshot AS guildName,
      title,
      description,
      cover_image_id AS coverImageId,
      revision,
      staff_edited AS staffEdited,
      submitted_at AS submittedAt,
      approved_at AS approvedAt
    FROM submissions
    WHERE competition_id = ?
      AND status = 'APPROVED'
      AND removed_at IS NULL
    ORDER BY approved_at ASC, id ASC
  `).bind(competitionId).all();
  return rows(result);
}

export async function listAcceptedPublicParticipants(db, submissionId) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    SELECT
      player_uuid AS playerUuid,
      player_name AS playerName,
      participant_role AS role
    FROM submission_participants
    WHERE submission_id = ?
      AND invite_status = 'ACCEPTED'
    ORDER BY
      CASE participant_role
        WHEN 'OWNER' THEN 1
        WHEN 'MAIN' THEN 2
        WHEN 'GUILD_WORKER' THEN 3
        WHEN 'HELPER' THEN 4
        ELSE 5
      END,
      player_name COLLATE NOCASE ASC
  `).bind(submissionId).all();
  return rows(result);
}

export async function getPrivateSubmissionLocation(db, submissionId) {
  const database = requireDatabase(db);
  return database.prepare(`
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
}

export async function listAdminCompetitions(db) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    SELECT
      id,
      slug,
      title,
      category,
      lifecycle_state AS lifecycleState,
      current_config_version AS configVersion,
      created_by_uuid AS createdByUuid,
      created_at AS createdAt,
      updated_at AS updatedAt,
      published_at AS publishedAt,
      archived_at AS archivedAt,
      cancelled_at AS cancelledAt
    FROM competitions
    ORDER BY updated_at DESC
  `).all();
  return rows(result);
}
