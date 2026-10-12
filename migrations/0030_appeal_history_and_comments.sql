PRAGMA foreign_keys = ON;

ALTER TABLE appeal_submissions
    ADD COLUMN case_id TEXT CHECK (case_id IS NULL OR length(case_id) BETWEEN 1 AND 32);

ALTER TABLE appeal_submissions
    ADD COLUMN punishment_type TEXT CHECK (punishment_type IS NULL OR length(punishment_type) BETWEEN 1 AND 64);

ALTER TABLE appeal_submissions
    ADD COLUMN current_status TEXT NOT NULL DEFAULT 'OPEN'
        CHECK (current_status IN (
            'OPEN',
            'INFORMATION_REQUESTED',
            'APPROVAL_PENDING',
            'APPLIED',
            'DENIED',
            'REJECTED'
        ));

ALTER TABLE appeal_submissions
    ADD COLUMN current_version INTEGER NOT NULL DEFAULT 1
        CHECK (current_version >= 1);

ALTER TABLE appeal_submissions
    ADD COLUMN status_updated_at TEXT;

CREATE TABLE appeal_comments (
    id TEXT PRIMARY KEY,
    appeal_id TEXT NOT NULL,
    author_type TEXT NOT NULL CHECK (author_type IN ('PLAYER', 'STAFF')),
    author_id TEXT NOT NULL CHECK (length(author_id) BETWEEN 1 AND 128),
    author_name TEXT NOT NULL CHECK (length(author_name) BETWEEN 1 AND 64),
    body TEXT NOT NULL CHECK (length(body) BETWEEN 3 AND 2000),
    idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
    created_at TEXT NOT NULL,
    FOREIGN KEY (appeal_id) REFERENCES appeal_submissions(appeal_id) ON DELETE CASCADE,
    UNIQUE (appeal_id, author_type, author_id, idempotency_key)
);

CREATE INDEX idx_appeal_comments_appeal
    ON appeal_comments(appeal_id, created_at, id);

CREATE TRIGGER appeal_comment_count_guard
BEFORE INSERT ON appeal_comments
FOR EACH ROW
WHEN (
    SELECT COUNT(*) FROM appeal_comments WHERE appeal_id = NEW.appeal_id
) >= 100
BEGIN
    SELECT RAISE(ABORT, 'appeal_comment_limit_reached');
END;

CREATE INDEX idx_appeal_submissions_owner_status
    ON appeal_submissions(owner_discord_id, status, submitted_at DESC);
