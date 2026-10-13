
export const transitionLifecycleSql = `
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
    `;
export const auditLifecycleTransitionSql = `
      INSERT INTO competition_audit_events (
        id, competition_id, actor_subject, actor_uuid, action,
        before_json, after_json, note, created_at
      )
      SELECT ?, c.id, ?, ?, 'COMPETITION_STATE_CHANGED', ?, ?, ?, ?
      FROM competitions c
      WHERE c.id = ?
        AND c.last_lifecycle_operation_id = ?
        AND c.lifecycle_state = ?
    `;
