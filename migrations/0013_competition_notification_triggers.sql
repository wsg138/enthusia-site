PRAGMA foreign_keys = ON;

-- Submission review notifications are created by the state transition itself so
-- every successful PENDING_REVIEW transition has a durable matching outbox row.
CREATE TRIGGER competition_submission_review_notification
AFTER UPDATE OF status ON submissions
WHEN NEW.status = 'PENDING_REVIEW' AND OLD.status <> 'PENDING_REVIEW'
BEGIN
  INSERT OR IGNORE INTO competition_notification_outbox (
    id, competition_id, submission_id, event_type, recipient_uuid,
    operation_key, payload_json, state, attempts, next_attempt_at,
    created_at, updated_at
  )
  SELECT
    lower(hex(randomblob(16))),
    NEW.competition_id,
    NEW.id,
    'SUBMISSION_REVIEW',
    NULL,
    'submission-review:' || NEW.id || ':' || NEW.revision,
    json_object(
      'competitionTitle', c.title,
      'competitionSlug', c.slug,
      'submissionTitle', NEW.title,
      'ownerName', NEW.owner_name,
      'submissionId', NEW.id
    ),
    'PENDING',
    0,
    COALESCE(NEW.submitted_at, NEW.updated_at),
    COALESCE(NEW.submitted_at, NEW.updated_at),
    COALESCE(NEW.submitted_at, NEW.updated_at)
  FROM competitions c
  WHERE c.id = NEW.competition_id;
END;

-- Accepting or declining an invite atomically clears its Minecraft login reminder.
CREATE TRIGGER competition_contributor_response_notification
AFTER UPDATE OF invite_status ON submission_participants
WHEN OLD.invite_status = 'PENDING'
  AND NEW.invite_status IN ('ACCEPTED','DECLINED')
BEGIN
  INSERT OR IGNORE INTO competition_notification_outbox (
    id, competition_id, submission_id, event_type, recipient_uuid,
    operation_key, payload_json, state, attempts, next_attempt_at,
    created_at, updated_at
  )
  SELECT
    lower(hex(randomblob(16))),
    s.competition_id,
    s.id,
    'CONTRIBUTOR_RESPONSE',
    NEW.player_uuid,
    'contributor-response:' || s.id || ':' || NEW.player_uuid || ':' || COALESCE(NEW.responded_at, 'unknown'),
    json_object('playerUuid', NEW.player_uuid),
    'PENDING',
    0,
    COALESCE(NEW.responded_at, s.updated_at),
    COALESCE(NEW.responded_at, s.updated_at),
    COALESCE(NEW.responded_at, s.updated_at)
  FROM submissions s
  WHERE s.id = NEW.submission_id;
END;

-- Removing a still-pending contributor also clears the reminder. During a
-- cascading submission delete the parent row no longer exists, so this SELECT
-- inserts nothing and does not create orphan notification work.
CREATE TRIGGER competition_contributor_remove_notification
AFTER DELETE ON submission_participants
WHEN OLD.invite_status = 'PENDING'
BEGIN
  INSERT OR IGNORE INTO competition_notification_outbox (
    id, competition_id, submission_id, event_type, recipient_uuid,
    operation_key, payload_json, state, attempts, next_attempt_at,
    created_at, updated_at
  )
  SELECT
    lower(hex(randomblob(16))),
    s.competition_id,
    s.id,
    'CONTRIBUTOR_RESPONSE',
    OLD.player_uuid,
    'contributor-removed:' || s.id || ':' || OLD.player_uuid || ':' || strftime('%Y%m%d%H%M%f', 'now'),
    json_object('playerUuid', OLD.player_uuid),
    'PENDING',
    0,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM submissions s
  WHERE s.id = OLD.submission_id
    AND s.removed_at IS NULL;
END;
