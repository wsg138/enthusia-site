
export const insertDraftConfigVersionSql = `
      INSERT INTO competition_config_versions (
        competition_id, version, config_json, created_by_subject,
        created_by_uuid, created_at, change_note, operation_id
      )
      SELECT id, ?, ?, ?, ?, ?, ?, ?
      FROM competitions
      WHERE id = ?
        AND lifecycle_state = 'DRAFT'
        AND current_config_version = ?
    `;
export const updateDraftCompetitionSql = `
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
    `;
export const auditDraftCompetitionSql = `
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
    `;
