function requireWritableDatabase(db) {
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new TypeError("Competition database binding is not writable");
  }
  return db;
}

function rewardPublicationStatements(database, transition) {
  if (!Array.isArray(transition.rewardDefinitions)) return [];
  if (transition.expectedState !== "DRAFT" || transition.targetState !== "UPCOMING") {
    throw new TypeError("Reward definitions may only be materialized when publishing a draft");
  }

  const statements = [
    database.prepare("DELETE FROM reward_definitions WHERE competition_id = ?")
      .bind(transition.competitionId)
  ];
  for (const reward of transition.rewardDefinitions) {
    statements.push(database.prepare(`
      INSERT INTO reward_definitions (
        id, competition_id, placement, reward_type,
        distribution_mode, config_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      reward.id,
      transition.competitionId,
      reward.placement,
      reward.rewardType,
      reward.distributionMode,
      reward.configJson,
      reward.createdAt
    ));
  }
  return statements;
}

export async function transitionCompetitionState(db, transition) {
  const database = requireWritableDatabase(db);
  const beforeJson = JSON.stringify({ lifecycleState: transition.expectedState });
  const afterJson = JSON.stringify({ lifecycleState: transition.targetState });
  const rewardStatements = rewardPublicationStatements(database, transition);
  const updateIndex = rewardStatements.length;

  const results = await database.batch([
    ...rewardStatements,
    database.prepare(`
      UPDATE competitions
      SET lifecycle_state = ?,
          updated_at = ?,
          last_lifecycle_operation_id = ?,
          published_at = CASE
            WHEN ? = 'UPCOMING' AND published_at IS NULL THEN ?
            ELSE published_at
          END,
          archived_at = CASE
            WHEN ? = 'ARCHIVED' THEN ?
            ELSE archived_at
          END,
          cancelled_at = CASE
            WHEN ? = 'CANCELLED' THEN ?
            ELSE cancelled_at
          END
      WHERE id = ?
        AND lifecycle_state = ?
    `).bind(
      transition.targetState,
      transition.createdAt,
      transition.operationId,
      transition.targetState,
      transition.createdAt,
      transition.targetState,
      transition.createdAt,
      transition.targetState,
      transition.createdAt,
      transition.competitionId,
      transition.expectedState
    ),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, actor_subject, actor_uuid, action,
        before_json, after_json, note, created_at
      )
      SELECT ?, c.id, ?, ?, 'COMPETITION_STATE_CHANGED', ?, ?, ?, ?
      FROM competitions c
      WHERE c.id = ?
        AND c.last_lifecycle_operation_id = ?
        AND c.lifecycle_state = ?
    `).bind(
      transition.auditEventId,
      transition.actorSubject,
      transition.actorUuid,
      beforeJson,
      afterJson,
      transition.note,
      transition.createdAt,
      transition.competitionId,
      transition.operationId,
      transition.targetState
    )
  ]);

  const changed = Number(results?.[updateIndex]?.meta?.changes ?? 0);
  if (changed !== 1) return { status: "CONFLICT" };
  return {
    status: "UPDATED",
    lifecycleState: transition.targetState,
    updatedAt: transition.createdAt
  };
}

export async function listCompetitionAuditEvents(db, competitionId, limit = 100) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("Competition database binding is unavailable");
  }
  const safeLimit = Number.isInteger(limit) ? Math.min(200, Math.max(1, limit)) : 100;
  const result = await db.prepare(`
    SELECT
      id,
      submission_id AS submissionId,
      actor_uuid AS actorUuid,
      action,
      before_json AS beforeJson,
      after_json AS afterJson,
      note,
      created_at AS createdAt
    FROM competition_audit_events
    WHERE competition_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).bind(competitionId, safeLimit).all();

  return (Array.isArray(result?.results) ? result.results : []).map((row) => ({
    ...row,
    before: row.beforeJson ? JSON.parse(row.beforeJson) : null,
    after: row.afterJson ? JSON.parse(row.afterJson) : null,
    beforeJson: undefined,
    afterJson: undefined
  }));
}
