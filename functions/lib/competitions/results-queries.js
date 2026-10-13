
export const resultReadinessSql = `
    SELECT
      c.current_config_version AS currentConfigVersion,
      (
        SELECT COUNT(*)
        FROM submissions s
        WHERE s.competition_id = c.id
          AND s.status = 'APPROVED'
          AND s.removed_at IS NULL
      ) AS eligibleSubmissionCount,
      (
        SELECT COUNT(*)
        FROM competition_result_drafts d
        JOIN submissions s ON s.id = d.submission_id
        WHERE d.competition_id = c.id
          AND s.competition_id = c.id
          AND s.status = 'APPROVED'
          AND s.removed_at IS NULL
      ) AS draftResultCount,
      (
        SELECT COUNT(*)
        FROM competition_result_drafts d
        LEFT JOIN submissions s
          ON s.id = d.submission_id
         AND s.competition_id = d.competition_id
        WHERE d.competition_id = c.id
          AND (
            s.id IS NULL
            OR s.status <> 'APPROVED'
            OR s.removed_at IS NOT NULL
          )
      ) AS invalidDraftCount,
      (
        SELECT COUNT(*)
        FROM competition_result_drafts d
        WHERE d.competition_id = c.id
          AND d.config_version <> c.current_config_version
      ) AS staleConfigCount,
      (
        SELECT COUNT(*)
        FROM submission_moderation sm
        JOIN submissions s ON s.id = sm.submission_id
        WHERE s.competition_id = c.id
          AND s.status = 'APPROVED'
          AND s.removed_at IS NULL
          AND sm.flagged_at IS NOT NULL
          AND sm.flag_reason IS NOT NULL
      ) AS openFlagCount
    FROM competitions c
    WHERE c.id = ?
    LIMIT 1
  `;

export const insertPublishedResultsSql = `
      INSERT INTO competition_results (
        competition_id, submission_id, placement, final_score,
        community_component, judge_component, config_version,
        snapshot_json, published_at
      )
      SELECT
        d.competition_id,
        d.submission_id,
        d.placement,
        d.final_score,
        d.community_component,
        d.judge_component,
        d.config_version,
        d.snapshot_json,
        ?
      FROM competition_result_drafts d
      JOIN competitions c ON c.id = d.competition_id
      WHERE d.competition_id = ?
        AND c.lifecycle_state = 'RESULTS_READY'
        AND c.current_config_version = d.config_version
      ORDER BY d.placement ASC
    `;
export const completeCompetitionResultsSql = `
      UPDATE competitions
      SET lifecycle_state = 'COMPLETED',
          updated_at = ?,
          last_lifecycle_operation_id = ?
      WHERE id = ?
        AND lifecycle_state = 'RESULTS_READY'
    `;
export const auditPublishedResultsSql = `
      INSERT INTO competition_audit_events (
        id, competition_id, actor_subject, actor_uuid, action,
        before_json, after_json, note, created_at
      )
      SELECT ?, c.id, ?, ?, 'COMPETITION_RESULTS_PUBLISHED', ?, ?, ?, ?
      FROM competitions c
      WHERE c.id = ?
        AND c.lifecycle_state = 'COMPLETED'
        AND c.last_lifecycle_operation_id = ?
    `;
