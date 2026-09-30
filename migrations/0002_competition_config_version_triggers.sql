PRAGMA foreign_keys = ON;

-- Every configuration change must be the next version after the currently
-- active snapshot. RAISE(ABORT) causes the surrounding D1 batch transaction to
-- roll back when two staff members attempt to save the same expected version.
CREATE TRIGGER competition_config_versions_enforce_sequence
BEFORE INSERT ON competition_config_versions
WHEN NEW.version > 1
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1
            FROM competitions
            WHERE id = NEW.competition_id
              AND current_config_version = NEW.version - 1
        )
        THEN RAISE(ABORT, 'stale_competition_config_version')
    END;
END;

-- Advancing the current pointer belongs to the same transaction as inserting
-- the immutable configuration snapshot. Application code never advances this
-- pointer independently.
CREATE TRIGGER competition_config_versions_advance_current
AFTER INSERT ON competition_config_versions
WHEN NEW.version > 1
BEGIN
    UPDATE competitions
    SET current_config_version = NEW.version,
        updated_at = NEW.created_at
    WHERE id = NEW.competition_id;
END;
