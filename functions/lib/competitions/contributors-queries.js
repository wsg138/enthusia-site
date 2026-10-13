
export const invitePendingParticipantSql = `
      INSERT INTO submission_participants (
        submission_id, player_uuid, player_name, participant_role,
        invite_status, invited_by_uuid, invited_at, responded_at
      )
      SELECT ?, ?, ?, ?, 'PENDING', ?, ?, NULL
      WHERE EXISTS (
        SELECT 1
        FROM submissions submission
        JOIN competitions competition ON competition.id = submission.competition_id
        WHERE submission.id = ?
          AND competition.id = ?
          AND competition.current_config_version = ?
          AND competition.lifecycle_state IN ('DRAFT','UPCOMING','SUBMISSIONS_OPEN','REVIEW')
      )
        AND (? IS NULL OR (
          SELECT COUNT(*)
          FROM submission_participants
          WHERE submission_id = ?
            AND participant_role = ?
            AND invite_status <> 'DECLINED'
        ) < ?)
      ON CONFLICT(submission_id, player_uuid) DO UPDATE SET
        player_name = excluded.player_name,
        participant_role = excluded.participant_role,
        invite_status = 'PENDING',
        invited_by_uuid = excluded.invited_by_uuid,
        invited_at = excluded.invited_at,
        responded_at = NULL
      WHERE submission_participants.invite_status = 'DECLINED'
    `;
export const auditContributorInviteSql = `
      INSERT INTO competition_audit_events (
        id, competition_id, submission_id, actor_subject, actor_uuid,
        action, after_json, note, created_at
      )
      SELECT ?, ?, ?, ?, ?, 'SUBMISSION_CONTRIBUTOR_INVITED', ?, ?, ?
      WHERE changes() = 1
    `;
export const queueContributorInviteSql = `
      INSERT INTO competition_notification_outbox (
        id, competition_id, submission_id, event_type, recipient_uuid,
        operation_key, payload_json, state, attempts, next_attempt_at,
        created_at, updated_at
      )
      SELECT ?, ?, ?, 'CONTRIBUTOR_INVITE', ?, ?, ?, 'PENDING', 0, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM submission_participants
        WHERE submission_id = ?
          AND player_uuid = ?
          AND invite_status = 'PENDING'
          AND invited_at = ?
      )
      ON CONFLICT(operation_key) DO NOTHING
    `;
