PRAGMA foreign_keys = ON;

CREATE TABLE competition_media (
    id TEXT PRIMARY KEY,
    competition_id TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('BANNER','GALLERY')),
    storage_key TEXT NOT NULL UNIQUE,
    sha256 TEXT NOT NULL,
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png','image/jpeg')),
    byte_size INTEGER NOT NULL CHECK (byte_size > 0),
    width INTEGER NOT NULL CHECK (width > 0),
    height INTEGER NOT NULL CHECK (height > 0),
    moderation_provider TEXT NOT NULL,
    moderation_model TEXT NOT NULL,
    moderation_outcome TEXT NOT NULL CHECK (moderation_outcome = 'PASSED'),
    moderation_categories_json TEXT NOT NULL,
    moderation_scores_json TEXT NOT NULL,
    moderation_applied_input_types_json TEXT NOT NULL,
    created_by_uuid TEXT NOT NULL,
    created_at TEXT NOT NULL,
    removed_at TEXT,
    removed_by_uuid TEXT,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
);

CREATE INDEX idx_competition_media_active
    ON competition_media(competition_id, purpose, removed_at, created_at);
