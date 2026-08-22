PRAGMA foreign_keys = ON;

ALTER TABLE competition_config_versions ADD COLUMN operation_id TEXT;

CREATE UNIQUE INDEX idx_competition_config_operation_id
    ON competition_config_versions(operation_id)
    WHERE operation_id IS NOT NULL;
