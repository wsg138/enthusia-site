import { insertPublishedResultsSql, completeCompetitionResultsSql, auditPublishedResultsSql } from "./results-queries.js";
import { resultReadinessSql } from "./results-queries.js";
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

function publicJudgeFeedback(snapshotJson) {
  let snapshot;
  try {
    snapshot = JSON.parse(snapshotJson);
  } catch {
    return [];
  }
  const scorecards = snapshot?.evidence?.judges?.scorecards;
  if (!Array.isArray(scorecards)) return [];
  return scorecards
    .map((scorecard) => typeof scorecard?.publicFeedback === "string" ? scorecard.publicFeedback.trim() : "")
    .filter(Boolean)
    .slice(0, 50);
}

export async function resultPublicationReadiness(db, competitionId) {
  const database = requireDatabase(db);
  const summary = await database.prepare(resultReadinessSql).bind(competitionId).first();

  if (!summary) {
    return { ready: false, errors: ["competition_not_found"], summary: null };
  }

  const normalized = {
    currentConfigVersion: Number(summary.currentConfigVersion),
    eligibleSubmissionCount: Number(summary.eligibleSubmissionCount),
    draftResultCount: Number(summary.draftResultCount),
    invalidDraftCount: Number(summary.invalidDraftCount),
    staleConfigCount: Number(summary.staleConfigCount),
    openFlagCount: Number(summary.openFlagCount)
  };

  const errors = [];
  if (normalized.eligibleSubmissionCount < 1) errors.push("no_approved_entries");
  if (normalized.draftResultCount !== normalized.eligibleSubmissionCount) errors.push("result_count_incomplete");
  if (normalized.invalidDraftCount > 0) errors.push("result_contains_ineligible_entry");
  if (normalized.staleConfigCount > 0) errors.push("result_config_version_stale");
  if (normalized.openFlagCount > 0) errors.push("open_submission_flags");

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

function publishedResultRowsStatement(database, publication, now){
  return database.prepare(insertPublishedResultsSql).bind(now, publication.competitionId);
}

function completedResultStateStatement(database, publication, now){
  return database.prepare(completeCompetitionResultsSql).bind(
      now,
      publication.operationId,
      publication.competitionId
    );
}

function publishedResultAuditStatement(database, publication, readiness, now){
  return database.prepare(auditPublishedResultsSql).bind(
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
    );
}

export async function publishProvisionalResults(db, publication) {
  const database = requireWritableDatabase(db);
  const readiness = await resultPublicationReadiness(database, publication.competitionId);
  if (!readiness.ready) return { status: "NOT_READY", readiness };

  const now = publication.publishedAt;
  const results = await database.batch([
    publishedResultRowsStatement(database, publication, now),
    completedResultStateStatement(database, publication, now),
    publishedResultAuditStatement(database, publication, readiness, now)
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
    staffEdited: Boolean(row.staffEdited),
    publicJudgeFeedback: publicJudgeFeedback(row.snapshotJson)
  }));
}

export { publicJudgeFeedback };
