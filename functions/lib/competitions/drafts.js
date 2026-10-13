import { insertDraftConfigVersionSql, updateDraftCompetitionSql, auditDraftCompetitionSql } from "./drafts-queries.js";
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

function draftConfigVersionStatement(database, change, nextVersion, configJson) {
  return database.prepare(insertDraftConfigVersionSql).bind(
      nextVersion,
      configJson,
      change.actorSubject,
      change.actorUuid,
      change.createdAt,
      change.changeNote,
      change.operationId,
      change.competitionId,
      change.expectedVersion
    );
}

function draftCompetitionUpdateStatement(database, change, nextVersion) {
  return database.prepare(updateDraftCompetitionSql).bind(
      change.title,
      change.category,
      change.visibility,
      change.createdAt,
      change.competitionId,
      nextVersion,
      change.operationId,
      change.competitionId,
      nextVersion
    );
}

function draftCompetitionAuditStatement(database, change, nextVersion, beforeJson, afterJson) {
  return database.prepare(auditDraftCompetitionSql).bind(
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
    );
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
    draftConfigVersionStatement(database, change, nextVersion, configJson),
    draftCompetitionUpdateStatement(database, change, nextVersion),
    draftCompetitionAuditStatement(database, change, nextVersion, beforeJson, afterJson)
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
