PRAGMA foreign_keys = ON;

CREATE TABLE appeal_discord_outbox (
    id TEXT PRIMARY KEY,
    appeal_id TEXT NOT NULL,
    owner_discord_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type = 'APPEAL_UPDATE'),
    operation_key TEXT NOT NULL UNIQUE,
    payload_json TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'PENDING' CHECK (state IN (
        'PENDING','DELIVERING','DELIVERED','FAILED','ABANDONED'
    )),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TEXT NOT NULL,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    delivered_at TEXT,
    FOREIGN KEY (appeal_id) REFERENCES appeal_submissions(appeal_id) ON DELETE CASCADE,
    FOREIGN KEY (owner_discord_id) REFERENCES competition_discord_accounts(discord_user_id) ON DELETE CASCADE
);

CREATE INDEX idx_appeal_discord_pending
    ON appeal_discord_outbox(state, next_attempt_at, created_at);

-- Staff comments include every decision note. Queueing from the database keeps
-- the visible update and its notification atomic while player replies stay quiet.
CREATE TRIGGER appeal_staff_comment_discord_notification
AFTER INSERT ON appeal_comments
WHEN NEW.author_type = 'STAFF'
BEGIN
  INSERT OR IGNORE INTO appeal_discord_outbox (
    id, appeal_id, owner_discord_id, event_type, operation_key, payload_json,
    state, attempts, next_attempt_at, created_at, updated_at
  )
  SELECT
    lower(hex(randomblob(16))),
    submission.appeal_id,
    submission.owner_discord_id,
    'APPEAL_UPDATE',
    'appeal-discord-update:' || NEW.id,
    json_object('appealId', submission.appeal_id),
    'PENDING',
    0,
    NEW.created_at,
    NEW.created_at,
    NEW.created_at
  FROM appeal_submissions AS submission
  WHERE submission.appeal_id = NEW.appeal_id
    AND submission.status = 'SUBMITTED';
END;

PRAGMA optimize;
