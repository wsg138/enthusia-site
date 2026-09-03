PRAGMA foreign_keys = ON;

CREATE TABLE competition_rate_limits (
    bucket_key TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (bucket_key, window_start)
);

CREATE INDEX idx_competition_rate_limits_expiry
    ON competition_rate_limits(expires_at);
