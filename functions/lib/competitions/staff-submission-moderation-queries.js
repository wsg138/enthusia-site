
export const moderateSubmissionStatementSql1 = `
      INSERT INTO submission_moderation (
        submission_id, public_reason, private_note, reviewed_by_uuid,
        reviewed_at, disqualified_at
      )
      SELECT ?, ?, ?, ?, ?, ?
      WHERE changes() = 1
      ON CONFLICT(submission_id) DO UPDATE SET
        public_reason = excluded.public_reason,
        private_note = excluded.private_note,
        reviewed_by_uuid = excluded.reviewed_by_uuid,
        reviewed_at = excluded.reviewed_at,
        disqualified_at = excluded.disqualified_at
    `;
export const moderateSubmissionStatementSql2 = `
      INSERT INTO competition_audit_events (
        id, competition_id, submission_id, actor_subject, actor_uuid,
        action, before_json, after_json, note, created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE changes() = 1
    `;

const moderateOwnedSubmissionTemplate1Sql = `
      UPDATE submissions
      SET status = ?,
          approved_at = CASE WHEN ? IS NOT NULL THEN ? ELSE approved_at END,
          updated_at = ?
      WHERE id = ?
        AND competition_id = ?
        AND removed_at IS NULL
        AND status = ?
        AND status IN (__ENTHUSIA_SQL_PART_0__)
        AND EXISTS (
          SELECT 1
          FROM competitions competition
          WHERE competition.id = submissions.competition_id
            AND competition.current_config_version = ?
        )
        AND (
          ? = 0
          OR (
            (
              SELECT COUNT(*)
              FROM submission_images image
              WHERE image.submission_id = submissions.id
                AND image.removed_at IS NULL
            ) >= ?
            AND NOT EXISTS (
              SELECT 1
              FROM submission_images image
              WHERE image.submission_id = submissions.id
                AND image.removed_at IS NULL
                AND image.moderation_state <> 'PASSED'
            )
            AND (
              ? = 0
              OR EXISTS (
                SELECT 1
                FROM submission_private_locations location
                WHERE location.submission_id = submissions.id
                  AND location.exact_coordinates_confirmed = 1
              )
            )
          )
        )
    `;
export function moderateOwnedSubmissionTemplate1(part0){return moderateOwnedSubmissionTemplate1Sql.replace("__ENTHUSIA_SQL_PART_0__",()=>part0);}
