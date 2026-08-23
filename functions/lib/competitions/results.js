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

export async function resultPublicationReadiness(db, competitionId) {
  const database = requireDatabase(db);
  const summary = await database.prepare(`
    SELECT
      c.current_config_version AS currentConfigVersion,
      (
        SELECT COUNT(*)
        FROM submissions s
        WHERE s.competition_id = c.id
          AND s.status = 'APPROVED'
          AND s.removed_at IS NULL
      ) AS eligibleSubmissionCount,
      (
        SELECT COUNT(*)
        FROM competition_result_drafts d
        JOIN submissions s ON s.id = d.submission_id
        WHERE d.competition_id = c.id
          AND s.competition_id = c.id
          AND s.status = 'APPROVED'
          AND s.removed_at IS NULL
      ) AS draftResultCount,
      (
        SELECT COUNT(*)
        FROM competition_result_drafts d
        LEFT JOIN submissions s
          ON s.id = d.submission_id
         AND s.competition_id = d.competition_id
        WHERE d.competition_id = c.id
          AND (
            s.id IS NULL
            OR s.status <> 'APPROVED'
            OR s.removed_at IS NOT NULL
          )
      ) AS invalidDraftCount,
      (
        SELECT COUNT(*)
        FROM competition_result_drafts d
        WHERE d.competition_id = c.id
          AND d.config_version <> c.current_config_version
      ) AS staleConfigCount
    FROM competitions c
    WHERE c.id = ?
    LIMIT 1
  `).bind(competitionId).first();

  if (!summary) {
    return { ready: false, errors: ["competition_not_found"], summary: null };
  }

  const normalized = {
    currentConfigVersion: Number(summary.currentConfigVersion),
    eligibleSubmissionCount: Number(summary.eligibleSubmissionCount),
    draftResultCount: Number(summary.draftResultCount),
    invalidDraftCount: Number(summary.invalidDraftCount),
    staleConfigCount: Number(summary.staleConfigCount)
  };

  const errors = [];
  if (normalized.eligibleSubmissionCount < 1) errors.push("no_approved_entries");
  if (normalized.draftResultCount !== normalized.eligibleSubmissionCount) errors.push("result_count_incomplete");
  if (normalized.invalidDraftCount > 0) errors.push("result_contains_ineligible_entry");
  if (normalized.staleConfigCount > 0) errors.push("result_config_version_stale");

  return { ready: errors.length === 0, errors, summary: normalized };
}

export async function listProvisionalResults(db, competitionId) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    SELECT
      d.submission_id AS submissionId,
      d.placement,
      d.final_score AS finalScore,
      d.community_component AS communityComponent,
      d.judge_component AS judgeComponent,
      d.config_version AS configVersion,
      d.snapshot_json AS snapshotJson,
      d.computed_at AS computedAt,
      d.computed_by_uuid AS computedByUuid,
      s.title,
      s.entry_type AS entryType,
      s.owner_uuid AS ownerUuid,
      s.owner_name AS ownerName,
      s.guild_id AS guildId,
      s.guild_name_snapshot AS guildName
    FROM competition_result_drafts d
    JOIN submissions s
      ON s.id = d.submission_id
     AND s.competition_id = d.competition_id
    WHERE d.competition_id = ?
    ORDER BY d.placement ASC, d.submission_id ASC
  `).bind(competitionId).all();

  return rows(result).map((row) => ({
    ...row,
    snapshot: JSON.parse(row.snapshotJson),
    snapshotJson: undefined
  }));
}

export async function publishProvisionalResults(db, publication) {
  const database = requireWritableDatabase(db);
  const readiness = await resultPublicationReadiness(database, publication.competitionId);
  if (!readiness.ready) return { status: "NOT_READY", readiness };

  const now = publication.publishedAt;
  const results = await database.batch([
    database.prepare(`
      INSERT INTO competition_results (
        competition_id, submission_id, placement, final_score,
        community_component, judge_component, config_version,
        snapshot_json, published_at
      )
      SELECT
        d.competition_id,
        d.submission_id,
        d.placement,
        d.final_score,
        d.community_component,
        d.judge_component,
        d.config_version,
        d.snapshot_json,
        ?
      FROM competition_result_drafts d
      JOIN competitions c ON c.id = d.competition_id
      WHERE d.competition_id = ?
        AND c.lifecycle_state = 'RESULTS_READY'
        AND c.current_config_version = d.config_version
      ORDER BY d.placement ASC
    `).bind(now, publication.competitionId),
    database.prepare(`
      UPDATE competitions
      SET lifecycle_state = 'COMPLETED',
          updated_at = ?,
          last_lifecycle_operation_id = ?
      WHERE id = ?
        AND lifecycle_state = 'RESULTS_READY'
    `).bind(
      now,
      publication.operationId,
      publication.competitionId
    ),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, actor_subject, actor_uuid, action,
        before_json, after_json, note, created_at
      )
      SELECT ?, c.id, ?, ?, 'COMPETITION_RESULTS_PUBLISHED', ?, ?, ?, ?
      FROM competitions c
      WHERE c.id = ?
        AND c.lifecycle_state = 'COMPLETED'
        AND c.last_lifecycle_operation_id = ?
    `).bind(
      publication.auditEventId,
      publication.actorSubject,
      publication.actorUuid,
      JSON.stringify({ lifecycleState: "RESULTS_READY" }),
      JSON.stringify({
        lifecycleState: "COMPLETED",
        resultCount: readiness.summary.draftResultCount,
        configVersion: readiness.summary.currentConfigVersion
      }),
      publication.note,
      now,
      publication.competitionId,
      publication.operationId
    )
  ]);

  const insertedResults = Number(results?.[0]?.meta?.changes ?? 0);
  const stateChanged = Number(results?.[1]?.meta?.changes ?? 0);
  if (stateChanged !== 1 || insertedResults !== readiness.summary.draftResultCount) {
    return { status: "CONFLICT", readiness };
  }

  return {
    status: "PUBLISHED",
    resultCount: insertedResults,
    configVersion: readiness.summary.currentConfigVersion,
    publishedAt: now
  };
}

export async function listPublicResults(db, competitionId) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    SELECT
      r.submission_id AS submissionId,
      r.placement,
      r.final_score AS finalScore,
      r.community_component AS communityComponent,
      r.judge_component AS judgeComponent,
      r.config_version AS configVersion,
      r.snapshot_json AS snapshotJson,
      r.published_at AS publishedAt,
      s.title,
      s.entry_type AS entryType,
      s.owner_uuid AS ownerUuid,
      s.owner_name AS ownerName,
      s.guild_id AS guildId,
      s.guild_name_snapshot AS guildName,
      s.staff_edited AS staffEdited
    FROM competition_results r
    JOIN submissions s
      ON s.id = r.submission_id
     AND s.competition_id = r.competition_id
    JOIN competitions c ON c.id = r.competition_id
    WHERE r.competition_id = ?
      AND c.lifecycle_state IN ('COMPLETED', 'ARCHIVED')
      AND c.visibility IN ('PUBLIC', 'UNLISTED')
    ORDER BY r.placement ASC, r.submission_id ASC
  `).bind(competitionId).all();

  return rows(result).map((row) => ({
    submissionId: row.submissionId,
    placement: row.placement,
    finalScore: row.finalScore,
    communityComponent: row.communityComponent,
    judgeComponent: row.judgeComponent,
    configVersion: row.configVersion,
    publishedAt: row.publishedAt,
    title: row.title,
    entryType: row.entryType,
    ownerUuid: row.ownerUuid,
    ownerName: row.ownerName,
    guildId: row.guildId ?? null,
    guildName: row.guildName ?? null,
    staffEdited: Boolean(row.staffEdited)
  }));
}
