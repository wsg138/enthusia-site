PRAGMA foreign_keys = ON;

ALTER TABLE competition_discord_accounts ADD COLUMN guild_role_ids_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE gallery_submissions (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('COMMUNITY_BUILDS', 'MAPART')),
    title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
    description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 600),
    submitter_discord_id TEXT NOT NULL,
    submitter_display_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'DENIED', 'REMOVED')),
    storage_key TEXT NOT NULL UNIQUE,
    sha256 TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    moderation_provider TEXT NOT NULL,
    moderation_model TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    reviewed_at TEXT,
    reviewer_discord_id TEXT,
    decision_note TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (submitter_discord_id) REFERENCES competition_discord_accounts(discord_user_id)
);

CREATE INDEX idx_gallery_public ON gallery_submissions(status, category, reviewed_at DESC);
CREATE INDEX idx_gallery_submitter ON gallery_submissions(submitter_discord_id, created_at DESC);
CREATE INDEX idx_gallery_review ON gallery_submissions(status, created_at ASC);

CREATE TABLE gallery_submission_events (
    id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('SUBMITTED', 'APPROVED', 'DENIED', 'DESCRIPTION_EDITED', 'REMOVED')),
    actor_discord_id TEXT NOT NULL,
    detail_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (submission_id) REFERENCES gallery_submissions(id) ON DELETE CASCADE
);

CREATE INDEX idx_gallery_events ON gallery_submission_events(submission_id, created_at ASC);
