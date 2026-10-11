import { calculateJudgeScore } from "./scoring.js";

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

function text(value, max, nullable = false) {
  if ((value === null || value === undefined || value === "") && nullable) return null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  return normalized && normalized.length <= max ? normalized : null;
}

export async function listCompetitionJudges(db, competitionId, { includeRemoved = false } = {}) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    SELECT
      competition_id AS competitionId,
      judge_uuid AS judgeUuid,
      judge_name AS judgeName,
      assigned_by_uuid AS assignedByUuid,
      assigned_at AS assignedAt,
      removed_at AS removedAt,
      removed_by_uuid AS removedByUuid,
      can_view_coordinates AS canViewCoordinates
    FROM competition_judges
    WHERE competition_id = ?
      ${includeRemoved ? "" : "AND removed_at IS NULL"}
    ORDER BY judge_name COLLATE NOCASE ASC, judge_uuid ASC
  `).bind(competitionId).all();
  return (Array.isArray(result?.results) ? result.results : []).map((row) => ({
    ...row,
    canViewCoordinates: Boolean(row.canViewCoordinates)
  }));
}

export async function isActiveCompetitionJudge(db, competitionId, judgeUuid) {
  const database = requireDatabase(db);
  const row = await database.prepare(`
    SELECT 1 AS assigned
    FROM competition_judges
    WHERE competition_id = ?
      AND judge_uuid = ?
      AND removed_at IS NULL
    LIMIT 1
  `).bind(competitionId, judgeUuid).first();
  return row?.assigned === 1;
}

export async function getActiveCompetitionJudge(db, competitionId, judgeUuid) {
  const database = requireDatabase(db);
  const row = await database.prepare(`
    SELECT
      competition_id AS competitionId,
      judge_uuid AS judgeUuid,
      judge_name AS judgeName,
      assigned_at AS assignedAt,
      can_view_coordinates AS canViewCoordinates
    FROM competition_judges
    WHERE competition_id = ?
      AND judge_uuid = ?
      AND removed_at IS NULL
    LIMIT 1
  `).bind(competitionId, judgeUuid).first();
  return row ? { ...row, canViewCoordinates: Boolean(row.canViewCoordinates) } : null;
}

export async function assignCompetitionJudge(db, assignment) {
  const database = requireWritableDatabase(db);
  const judgeName = text(assignment.judgeName, 64);
  if (!judgeName) throw new TypeError("Judge name is invalid");

  const beforeJson = JSON.stringify({ judgeUuid: assignment.judgeUuid, active: false });
  const afterJson = JSON.stringify({
    judgeUuid: assignment.judgeUuid,
    judgeName,
    active: true,
    canViewCoordinates: Boolean(assignment.canViewCoordinates)
  });

  const results = await database.batch([
    database.prepare(`
      INSERT INTO competition_judges (
        competition_id, judge_uuid, judge_name,
        assigned_by_uuid, assigned_at, removed_at, removed_by_uuid,
        can_view_coordinates
      ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)
      ON CONFLICT(competition_id, judge_uuid) DO UPDATE SET
        judge_name = excluded.judge_name,
        assigned_by_uuid = excluded.assigned_by_uuid,
        assigned_at = excluded.assigned_at,
        removed_at = NULL,
        removed_by_uuid = NULL,
        can_view_coordinates = excluded.can_view_coordinates
    `).bind(
      assignment.competitionId,
      assignment.judgeUuid,
      judgeName,
      assignment.assignedByUuid,
      assignment.assignedAt,
      assignment.canViewCoordinates ? 1 : 0
    ),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, actor_subject, actor_uuid, action,
        before_json, after_json, note, created_at
      ) VALUES (?, ?, ?, ?, 'COMPETITION_JUDGE_ASSIGNED', ?, ?, ?, ?)
    `).bind(
      assignment.auditEventId,
      assignment.competitionId,
      assignment.actorSubject,
      assignment.assignedByUuid,
      beforeJson,
      afterJson,
      assignment.note ?? `Assigned judge ${judgeName}`,
      assignment.assignedAt
    )
  ]);

  return Number(results?.[0]?.meta?.changes ?? 0) === 1;
}

export async function removeCompetitionJudge(db, removal) {
  const database = requireWritableDatabase(db);
  const results = await database.batch([
    database.prepare(`
      UPDATE competition_judges
      SET removed_at = ?, removed_by_uuid = ?
      WHERE competition_id = ?
        AND judge_uuid = ?
        AND removed_at IS NULL
    `).bind(
      removal.removedAt,
      removal.removedByUuid,
      removal.competitionId,
      removal.judgeUuid
    ),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, actor_subject, actor_uuid, action,
        before_json, after_json, note, created_at
      )
      SELECT ?, ?, ?, ?, 'COMPETITION_JUDGE_REMOVED', ?, ?, ?, ?
      WHERE changes() = 1
    `).bind(
      removal.auditEventId,
      removal.competitionId,
      removal.actorSubject,
      removal.removedByUuid,
      JSON.stringify({ judgeUuid: removal.judgeUuid, active: true }),
      JSON.stringify({ judgeUuid: removal.judgeUuid, active: false }),
      removal.note ?? "Judge removed",
      removal.removedAt
    )
  ]);
  return Number(results?.[0]?.meta?.changes ?? 0) === 1;
}

export async function saveJudgeScore(db, scoreInput) {
  const database = requireDatabase(db);
  const publicFeedback = text(scoreInput.publicFeedback, 2000, true);
  const privateNote = text(scoreInput.privateNote, 4000, true);
  if (scoreInput.publicFeedback && !publicFeedback) throw new TypeError("Public judge feedback is invalid");
  if (scoreInput.privateNote && !privateNote) throw new TypeError("Private judge note is invalid");

  const calculated = calculateJudgeScore({
    criteria: scoreInput.criteria,
    scores: scoreInput.scores,
    bonusPoints: scoreInput.bonusPoints ?? 0
  });

  const result = await database.prepare(`
    INSERT INTO judge_scores (
      competition_id, submission_id, judge_uuid, config_version,
      criteria_json, bonus_points, computed_score,
      public_feedback, private_note, submitted_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(competition_id, submission_id, judge_uuid) DO UPDATE SET
      config_version = excluded.config_version,
      criteria_json = excluded.criteria_json,
      bonus_points = excluded.bonus_points,
      computed_score = excluded.computed_score,
      public_feedback = excluded.public_feedback,
      private_note = excluded.private_note,
      updated_at = excluded.updated_at
  `).bind(
    scoreInput.competitionId,
    scoreInput.submissionId,
    scoreInput.judgeUuid,
    scoreInput.configVersion,
    JSON.stringify(calculated.scores),
    calculated.bonusPoints,
    calculated.computedScore,
    publicFeedback,
    privateNote,
    scoreInput.submittedAt,
    scoreInput.updatedAt
  ).run();

  return {
    updated: Number(result?.meta?.changes ?? 0) === 1,
    computedScore: calculated.computedScore,
    baseScore: calculated.baseScore,
    bonusPoints: calculated.bonusPoints
  };
}

export async function getJudgeScore(db, competitionId, submissionId, judgeUuid) {
  const database = requireDatabase(db);
  const row = await database.prepare(`
    SELECT
      submission_id AS submissionId,
      judge_uuid AS judgeUuid,
      config_version AS configVersion,
      criteria_json AS criteriaJson,
      bonus_points AS bonusPoints,
      computed_score AS computedScore,
      public_feedback AS publicFeedback,
      private_note AS privateNote,
      submitted_at AS submittedAt,
      updated_at AS updatedAt
    FROM judge_scores
    WHERE competition_id = ?
      AND submission_id = ?
      AND judge_uuid = ?
    LIMIT 1
  `).bind(competitionId, submissionId, judgeUuid).first();
  if (!row) return null;
  return {
    ...row,
    criteria: JSON.parse(row.criteriaJson),
    criteriaJson: undefined
  };
}

export async function listCompetitionJudgeScores(db, competitionId) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    SELECT
      js.submission_id AS submissionId,
      js.judge_uuid AS judgeUuid,
      j.judge_name AS judgeName,
      js.config_version AS configVersion,
      js.criteria_json AS criteriaJson,
      js.bonus_points AS bonusPoints,
      js.computed_score AS computedScore,
      js.public_feedback AS publicFeedback,
      js.private_note AS privateNote,
      js.submitted_at AS submittedAt,
      js.updated_at AS updatedAt
    FROM judge_scores js
    LEFT JOIN competition_judges j
      ON j.competition_id = js.competition_id
     AND j.judge_uuid = js.judge_uuid
    WHERE js.competition_id = ?
    ORDER BY js.submission_id ASC, COALESCE(j.judge_name, js.judge_uuid) COLLATE NOCASE ASC
  `).bind(competitionId).all();

  return (Array.isArray(result?.results) ? result.results : []).map((row) => ({
    ...row,
    criteria: JSON.parse(row.criteriaJson),
    criteriaJson: undefined
  }));
}
