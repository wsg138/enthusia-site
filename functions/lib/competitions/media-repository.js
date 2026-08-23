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

function publicMediaRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    competitionId: row.competitionId,
    purpose: row.purpose,
    storageKey: row.storageKey,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    sha256: row.sha256
  };
}

function moderationBindings(record) {
  return [
    record.moderation.provider,
    record.moderation.model,
    JSON.stringify(record.moderation.categories ?? {}),
    JSON.stringify(record.moderation.scores ?? {}),
    JSON.stringify(record.moderation.appliedInputTypes ?? {})
  ];
}

export async function createCompetitionMediaRecord(db, record) {
  const database = requireWritableDatabase(db);
  const afterJson = JSON.stringify({
    mediaId: record.id,
    purpose: record.purpose,
    mimeType: record.mimeType,
    width: record.width,
    height: record.height,
    sha256: record.sha256,
    moderationOutcome: "PASSED"
  });

  const results = await database.batch([
    database.prepare(`
      INSERT INTO competition_media (
        id, competition_id, purpose, storage_key, sha256, mime_type,
        byte_size, width, height, moderation_provider, moderation_model,
        moderation_outcome, moderation_categories_json, moderation_scores_json,
        moderation_applied_input_types_json, created_by_uuid, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PASSED', ?, ?, ?, ?, ?)
    `).bind(
      record.id,
      record.competitionId,
      record.purpose,
      record.storageKey,
      record.sha256,
      record.mimeType,
      record.byteSize,
      record.width,
      record.height,
      ...moderationBindings(record),
      record.createdByUuid,
      record.createdAt
    ),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, actor_subject, actor_uuid, action,
        after_json, note, created_at
      ) VALUES (?, ?, ?, ?, 'COMPETITION_MEDIA_CREATED', ?, ?, ?)
    `).bind(
      record.auditEventId,
      record.competitionId,
      record.actorSubject,
      record.createdByUuid,
      afterJson,
      `${record.purpose} image uploaded and passed automated moderation`,
      record.createdAt
    )
  ]);

  const inserted = Number(results?.[0]?.meta?.changes ?? 0);
  if (inserted !== 1) throw new Error("competition_media_insert_failed");
  return publicMediaRow({
    id: record.id,
    competitionId: record.competitionId,
    purpose: record.purpose,
    storageKey: record.storageKey,
    mimeType: record.mimeType,
    byteSize: record.byteSize,
    width: record.width,
    height: record.height,
    sha256: record.sha256
  });
}

export async function createAndAttachCompetitionBanner(db, change) {
  const database = requireWritableDatabase(db);
  const nextVersion = change.expectedVersion + 1;
  const configJson = JSON.stringify(change.config);
  const mediaAfter = JSON.stringify({
    mediaId: change.id,
    purpose: "BANNER",
    mimeType: change.mimeType,
    width: change.width,
    height: change.height,
    sha256: change.sha256,
    moderationOutcome: "PASSED",
    configVersion: nextVersion
  });

  const results = await database.batch([
    database.prepare(`
      INSERT INTO competition_media (
        id, competition_id, purpose, storage_key, sha256, mime_type,
        byte_size, width, height, moderation_provider, moderation_model,
        moderation_outcome, moderation_categories_json, moderation_scores_json,
        moderation_applied_input_types_json, created_by_uuid, created_at
      )
      SELECT ?, c.id, 'BANNER', ?, ?, ?, ?, ?, ?, ?, ?, 'PASSED', ?, ?, ?, ?, ?
      FROM competitions c
      WHERE c.id = ?
        AND c.lifecycle_state = 'DRAFT'
        AND c.current_config_version = ?
    `).bind(
      change.id,
      change.storageKey,
      change.sha256,
      change.mimeType,
      change.byteSize,
      change.width,
      change.height,
      ...moderationBindings(change),
      change.actorUuid,
      change.createdAt,
      change.competitionId,
      change.expectedVersion
    ),
    database.prepare(`
      INSERT INTO competition_config_versions (
        competition_id, version, config_json, created_by_subject,
        created_by_uuid, created_at, change_note, operation_id
      )
      SELECT c.id, ?, ?, ?, ?, ?, 'Banner image updated', ?
      FROM competitions c
      WHERE c.id = ?
        AND c.lifecycle_state = 'DRAFT'
        AND c.current_config_version = ?
        AND EXISTS (
          SELECT 1 FROM competition_media m
          WHERE m.id = ? AND m.competition_id = c.id AND m.removed_at IS NULL
        )
    `).bind(
      nextVersion,
      configJson,
      change.actorSubject,
      change.actorUuid,
      change.createdAt,
      change.operationId,
      change.competitionId,
      change.expectedVersion,
      change.id
    ),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, actor_subject, actor_uuid, action,
        after_json, note, created_at
      )
      SELECT ?, c.id, ?, ?, 'COMPETITION_BANNER_UPDATED', ?, ?, ?
      FROM competitions c
      WHERE c.id = ?
        AND c.current_config_version = ?
        AND EXISTS (
          SELECT 1 FROM competition_media m
          WHERE m.id = ? AND m.competition_id = c.id AND m.removed_at IS NULL
        )
    `).bind(
      change.auditEventId,
      change.actorSubject,
      change.actorUuid,
      mediaAfter,
      "Banner image uploaded, moderated, and attached to the competition",
      change.createdAt,
      change.competitionId,
      nextVersion,
      change.id
    )
  ]);

  const mediaInserted = Number(results?.[0]?.meta?.changes ?? 0);
  const configInserted = Number(results?.[1]?.meta?.changes ?? 0);
  if (mediaInserted !== 1 || configInserted !== 1) return { status: "CONFLICT" };

  return {
    status: "UPDATED",
    media: publicMediaRow({
      id: change.id,
      competitionId: change.competitionId,
      purpose: "BANNER",
      storageKey: change.storageKey,
      mimeType: change.mimeType,
      byteSize: change.byteSize,
      width: change.width,
      height: change.height,
      sha256: change.sha256
    }),
    configVersion: nextVersion
  };
}

export async function getCompetitionMediaForManager(db, competitionId, mediaId) {
  const database = requireDatabase(db);
  const row = await database.prepare(`
    SELECT
      id,
      competition_id AS competitionId,
      purpose,
      storage_key AS storageKey,
      mime_type AS mimeType,
      byte_size AS byteSize,
      width,
      height,
      sha256
    FROM competition_media
    WHERE id = ?
      AND competition_id = ?
      AND removed_at IS NULL
      AND moderation_outcome = 'PASSED'
    LIMIT 1
  `).bind(mediaId, competitionId).first();
  return publicMediaRow(row);
}

export async function getPublicCompetitionMedia(db, mediaId) {
  const database = requireDatabase(db);
  const row = await database.prepare(`
    SELECT
      m.id,
      m.competition_id AS competitionId,
      m.purpose,
      m.storage_key AS storageKey,
      m.mime_type AS mimeType,
      m.byte_size AS byteSize,
      m.width,
      m.height,
      m.sha256
    FROM competition_media m
    JOIN competitions c ON c.id = m.competition_id
    JOIN competition_config_versions v
      ON v.competition_id = c.id
     AND v.version = c.current_config_version
    WHERE m.id = ?
      AND m.removed_at IS NULL
      AND m.moderation_outcome = 'PASSED'
      AND c.visibility IN ('PUBLIC', 'UNLISTED')
      AND c.published_at IS NOT NULL
      AND c.lifecycle_state NOT IN ('DRAFT', 'CANCELLED')
      AND m.purpose = 'BANNER'
      AND json_extract(v.config_json, '$.appearance.bannerImageId') = m.id
    LIMIT 1
  `).bind(mediaId).first();
  return publicMediaRow(row);
}

export async function removeCompetitionMediaRecord(db, removal) {
  const database = requireWritableDatabase(db);
  const results = await database.batch([
    database.prepare(`
      UPDATE competition_media
      SET removed_at = ?, removed_by_uuid = ?
      WHERE id = ?
        AND competition_id = ?
        AND removed_at IS NULL
    `).bind(
      removal.removedAt,
      removal.actorUuid,
      removal.mediaId,
      removal.competitionId
    ),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, actor_subject, actor_uuid, action,
        before_json, note, created_at
      )
      SELECT ?, ?, ?, ?, 'COMPETITION_MEDIA_REMOVED', ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM competition_media
        WHERE id = ?
          AND competition_id = ?
          AND removed_at = ?
          AND removed_by_uuid = ?
      )
    `).bind(
      removal.auditEventId,
      removal.competitionId,
      removal.actorSubject,
      removal.actorUuid,
      JSON.stringify({ mediaId: removal.mediaId }),
      removal.note,
      removal.removedAt,
      removal.mediaId,
      removal.competitionId,
      removal.removedAt,
      removal.actorUuid
    )
  ]);
  return Number(results?.[0]?.meta?.changes ?? 0) === 1;
}
