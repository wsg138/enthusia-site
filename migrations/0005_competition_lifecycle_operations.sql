PRAGMA foreign_keys = ON;

ALTER TABLE competitions ADD COLUMN last_lifecycle_operation_id TEXT;

CREATE UNIQUE INDEX idx_competitions_lifecycle_operation_id
    ON competitions(last_lifecycle_operation_id)
    WHERE last_lifecycle_operation_id IS NOT NULL;
