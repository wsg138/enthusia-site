PRAGMA foreign_keys = ON;

CREATE TABLE competition_notification_outbox (
    id TEXT PRIMARY KEY,
    competition_id TEXT NOT NULL,
    submission_id TEXT,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'SUBMISSION_REVIEW','CONTRIBUTOR_INVITE','CONTRIBUTOR_RESPONSE','RESULTS_PUBLISHED','REWARD_STATUS'
    )),
    recipient_uuid TEXT,
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

CREATE INDEX idx_competition_notification_pending
    ON competition_notification_outbox(state, next_attempt_at, created_at);
CREATE INDEX idx_competition_notification_submission
    ON competition_notification_outbox(submission_id, created_at);
