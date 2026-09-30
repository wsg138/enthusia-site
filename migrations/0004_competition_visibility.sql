PRAGMA foreign_keys = ON;

ALTER TABLE competitions
    ADD COLUMN visibility TEXT NOT NULL DEFAULT 'PUBLIC'
    CHECK (visibility IN ('PUBLIC','UNLISTED','STAFF_ONLY'));

CREATE INDEX idx_competitions_public_visibility
    ON competitions(visibility, lifecycle_state, published_at);
