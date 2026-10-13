
export const insertCompetitionMediaSql = `
      INSERT INTO competition_media (
        id, competition_id, purpose, storage_key, sha256, mime_type,
        byte_size, width, height, moderation_provider, moderation_model,
        moderation_outcome, moderation_categories_json, moderation_scores_json,
        moderation_applied_input_types_json, created_by_uuid, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PASSED', ?, ?, ?, ?, ?)
    `;
export const auditCompetitionMediaSql = `
      INSERT INTO competition_audit_events (
        id, competition_id, actor_subject, actor_uuid, action,
        after_json, note, created_at
      ) VALUES (?, ?, ?, ?, 'COMPETITION_MEDIA_CREATED', ?, ?, ?)
    `;
