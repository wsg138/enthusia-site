
export const assignJudgeSql = `
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
    `;
export const auditJudgeAssignmentSql = `
      INSERT INTO competition_audit_events (
        id, competition_id, actor_subject, actor_uuid, action,
        before_json, after_json, note, created_at
      ) VALUES (?, ?, ?, ?, 'COMPETITION_JUDGE_ASSIGNED', ?, ?, ?, ?)
    `;
