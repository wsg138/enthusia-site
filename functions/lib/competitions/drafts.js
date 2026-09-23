function requireDatabase(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("Competition database binding is unavailable");
  }
  return db;
}

function requireWritableDatabase(db) {
  const database = requireDatabase(db);
  if (typeof database.batch !== "function") {
    throw new TypeError("Competition database binding does not support transactional batches");
  }
  return database;
}

function parseConfig(value) {
  if (typeof value !== "string") throw new Error("Competition config is unavailable");
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Competition config is invalid");
  }
  return parsed;
}

export async function getAdminCompetition(db, competitionId) {
  const database = requireDatabase(db);
  const row = await database.prepare(`
    SELECT
      c.id,
      c.slug,
      c.title,
      c.category,
      c.visibility,
      c.lifecycle_state AS lifecycleState,
      c.current_config_version AS configVersion,
      c.last_lifecycle_operation_id AS lastLifecycleOperationId,
      c.created_by_uuid AS createdByUuid,
      c.created_at AS createdAt,
      c.updated_at AS updatedAt,
      c.published_at AS publishedAt,
      c.archived_at AS archivedAt,
      c.cancelled_at AS cancelledAt,
      v.config_json AS configJson
    FROM competitions c
    JOIN competition_config_versions v
      ON v.competition_id = c.id
     AND v.version = c.current_config_version
    WHERE c.id = ?
    LIMIT 1
  `).bind(competitionId).first();

  if (!row) return null;
  const { configJson, ...competition } = row;
  return { ...competition, config: parseConfig(configJson) };
}

export async function saveDraftCompetition(db, change) {
  const database = requireWritableDatabase(db);
  const nextVersion = change.expectedVersion + 1;
  const configJson = JSON.stringify(change.config);
  const beforeJson = JSON.stringify({
    title: change.beforeTitle,
    category: change.beforeCategory,
    visibility: change.beforeVisibility,
    configVersion: change.expectedVersion
  });
  const afterJson = JSON.stringify({
    title: change.title,
    category: change.category,
    visibility: change.visibility,
    configVersion: nextVersion
  });

  const results = await database.batch([
    database.prepare(`
      INSERT INTO competition_config_versions (
        competition_id, version, config_json, created_by_subject,
        created_by_uuid, created_at, change_note, operation_id
      )
      SELECT id, ?, ?, ?, ?, ?, ?, ?
      FROM competitions
      WHERE id = ?
        AND lifecycle_state = 'DRAFT'
        AND current_config_version = ?
    `).bind(
      nextVersion,
      configJson,
      change.actorSubject,
      change.actorUuid,
      change.createdAt,
      change.changeNote,
      change.operationId,
      change.competitionId,
      change.expectedVersion
    ),
    database.prepare(`
      UPDATE competitions
      SET title = ?,
          category = ?,
          visibility = ?,
          updated_at = ?
      WHERE id = ?
        AND lifecycle_state = 'DRAFT'
        AND current_config_version = ?
        AND EXISTS (
          SELECT 1
          FROM competition_config_versions
          WHERE operation_id = ?
            AND competition_id = ?
            AND version = ?
        )
    `).bind(
      change.title,
      change.category,
      change.visibility,
      change.createdAt,
      change.competitionId,
      nextVersion,
      change.operationId,
      change.competitionId,
      nextVersion
    ),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, actor_subject, actor_uuid, action,
        before_json, after_json, note, created_at
      )
      SELECT ?, c.id, ?, ?, 'COMPETITION_DRAFT_UPDATED', ?, ?, ?, ?
      FROM competitions c
      WHERE c.id = ?
        AND EXISTS (
          SELECT 1
          FROM competition_config_versions
          WHERE operation_id = ?
            AND competition_id = c.id
            AND version = ?
        )
    `).bind(
      change.auditEventId,
      change.actorSubject,
      change.actorUuid,
      beforeJson,
      afterJson,
      change.changeNote,
      change.createdAt,
      change.competitionId,
      change.operationId,
      nextVersion
    )
  ]);

  const inserted = Number(results?.[0]?.meta?.changes ?? 0);
  if (inserted !== 1) return { status: "CONFLICT" };

  return {
    status: "UPDATED",
    competition: {
      id: change.competitionId,
      title: change.title,
      category: change.category,
      visibility: change.visibility,
      lifecycleState: "DRAFT",
      configVersion: nextVersion,
      updatedAt: change.createdAt,
      config: change.config
    }
  };
}
