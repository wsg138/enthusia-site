
export const insertDraftCompetitionSql = `
      INSERT INTO competitions (
        id, slug, title, category, lifecycle_state, current_config_version,
        created_by_subject, created_by_uuid, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'DRAFT', 1, ?, ?, ?, ?)
    `;
export const insertInitialCompetitionConfigSql = `
      INSERT INTO competition_config_versions (
        competition_id, version, config_json, created_by_subject,
        created_by_uuid, created_at, change_note
      ) VALUES (?, 1, ?, ?, ?, ?, ?)
    `;
export const auditDraftCreationSql = `
      INSERT INTO competition_audit_events (
        id, competition_id, actor_subject, actor_uuid, action,
        after_json, note, created_at
      ) VALUES (?, ?, ?, ?, 'COMPETITION_CREATED', ?, ?, ?)
    `;
