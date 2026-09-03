PRAGMA foreign_keys = ON;

-- Competition appearance media started with only banners. Extend the explicit
-- purpose constraint without weakening any of the existing moderation/storage
-- guarantees or reusing Gallery media for unrelated UI artwork.
CREATE TABLE competition_media_v2 (
    id TEXT PRIMARY KEY,
    competition_id TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('BANNER','GALLERY','ICON','CATEGORY')),
    storage_key TEXT NOT NULL UNIQUE,
    sha256 TEXT NOT NULL,
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png','image/jpeg')),
    byte_size INTEGER NOT NULL CHECK (byte_size > 0),
    width INTEGER NOT NULL CHECK (width > 0),
    height INTEGER NOT NULL CHECK (height > 0),
    moderation_provider TEXT NOT NULL,
    moderation_model TEXT NOT NULL,
    moderation_outcome TEXT NOT NULL CHECK (moderation_outcome = 'PASSED'),
    moderation_categories_json TEXT NOT NULL DEFAULT '{}',
    moderation_scores_json TEXT NOT NULL DEFAULT '{}',
    moderation_applied_input_types_json TEXT NOT NULL DEFAULT '{}',
    created_by_uuid TEXT NOT NULL,
    created_at TEXT NOT NULL,
    removed_at TEXT,
    removed_by_uuid TEXT,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
);

INSERT INTO competition_media_v2 (
    id, competition_id, purpose, storage_key, sha256, mime_type, byte_size,
    width, height, moderation_provider, moderation_model, moderation_outcome,
    moderation_categories_json, moderation_scores_json,
    moderation_applied_input_types_json, created_by_uuid, created_at,
    removed_at, removed_by_uuid
)
SELECT
    id, competition_id, purpose, storage_key, sha256, mime_type, byte_size,
    width, height, moderation_provider, moderation_model, moderation_outcome,
    moderation_categories_json, moderation_scores_json,
    moderation_applied_input_types_json, created_by_uuid, created_at,
    removed_at, removed_by_uuid
FROM competition_media;

DROP TABLE competition_media;
ALTER TABLE competition_media_v2 RENAME TO competition_media;

CREATE INDEX idx_competition_media_active
    ON competition_media(competition_id, purpose, removed_at, created_at);
