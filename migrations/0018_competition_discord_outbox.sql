PRAGMA foreign_keys = ON;

CREATE TABLE competition_discord_outbox (
    id TEXT PRIMARY KEY,
    competition_id TEXT NOT NULL,
    submission_id TEXT,
    event_type TEXT NOT NULL CHECK (event_type IN ('SUBMISSION_REVIEW')),
    operation_key TEXT NOT NULL UNIQUE,
    payload_json TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'PENDING' CHECK (state IN (
        'PENDING','DELIVERING','DELIVERED','FAILED'
    )),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TEXT NOT NULL,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    delivered_at TEXT,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE INDEX idx_competition_discord_pending
    ON competition_discord_outbox(state, next_attempt_at, created_at);

CREATE TRIGGER competition_submission_review_discord_notification
AFTER UPDATE OF status ON submissions
WHEN NEW.status = 'PENDING_REVIEW' AND OLD.status <> 'PENDING_REVIEW'
BEGIN
  INSERT OR IGNORE INTO competition_discord_outbox (
    id, competition_id, submission_id, event_type, operation_key,
    payload_json, state, attempts, next_attempt_at, created_at, updated_at
  )
  SELECT
    lower(hex(randomblob(16))),
    NEW.competition_id,
    NEW.id,
    'SUBMISSION_REVIEW',
    'discord-submission-review:' || NEW.id || ':' || NEW.revision,
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
