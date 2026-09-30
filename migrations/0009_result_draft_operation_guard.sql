PRAGMA foreign_keys = ON;

ALTER TABLE competitions ADD COLUMN last_results_operation_id TEXT;
CREATE UNIQUE INDEX idx_competitions_results_operation_id
    ON competitions(last_results_operation_id)
    WHERE last_results_operation_id IS NOT NULL;

CREATE TABLE competition_result_draft_operations (
    operation_id TEXT PRIMARY KEY,
    competition_id TEXT NOT NULL,
    config_version INTEGER NOT NULL CHECK (config_version >= 1),
    result_set_hash TEXT NOT NULL CHECK (length(result_set_hash) = 64),
    created_by_uuid TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
);

CREATE INDEX idx_result_draft_operations_competition
    ON competition_result_draft_operations(competition_id, created_at);

CREATE TRIGGER competition_result_draft_operation_guard
BEFORE INSERT ON competition_result_draft_operations
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1
            FROM competitions c
            WHERE c.id = NEW.competition_id
              AND c.lifecycle_state = 'RESULTS_READY'
              AND c.current_config_version = NEW.config_version
        )
        THEN RAISE(ABORT, 'competition_result_drafts_wrong_state_or_config')
    END;
END;

CREATE TRIGGER competition_result_drafts_reject_operation_replay
BEFORE UPDATE OF last_results_operation_id ON competitions
WHEN NEW.last_results_operation_id IS NOT NULL
     AND NEW.last_results_operation_id = OLD.last_results_operation_id
BEGIN
    SELECT RAISE(ABORT, 'competition_result_drafts_operation_replay');
END;

CREATE TRIGGER competition_result_drafts_guard_finalize
BEFORE UPDATE OF last_results_operation_id ON competitions
WHEN NEW.last_results_operation_id IS NOT NULL
     AND NEW.last_results_operation_id IS NOT OLD.last_results_operation_id
BEGIN
    SELECT CASE
        WHEN NEW.lifecycle_state <> 'RESULTS_READY'
        THEN RAISE(ABORT, 'competition_result_drafts_wrong_state')
    END;

    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1
            FROM competition_result_draft_operations o
            WHERE o.operation_id = NEW.last_results_operation_id
              AND o.competition_id = NEW.id
              AND o.config_version = NEW.current_config_version
        )
        THEN RAISE(ABORT, 'competition_result_drafts_operation_missing')
    END;

    SELECT CASE
        WHEN (
            SELECT COUNT(*)
            FROM submissions s
            WHERE s.competition_id = NEW.id
              AND s.status = 'APPROVED'
              AND s.removed_at IS NULL
        ) < 1
        THEN RAISE(ABORT, 'competition_result_drafts_no_approved_entries')
    END;

    SELECT CASE
        WHEN (
            SELECT COUNT(*)
            FROM competition_result_drafts d
            JOIN submissions s
              ON s.id = d.submission_id
             AND s.competition_id = d.competition_id
            WHERE d.competition_id = NEW.id
              AND s.status = 'APPROVED'
              AND s.removed_at IS NULL
        ) <> (
            SELECT COUNT(*)
            FROM submissions s
            WHERE s.competition_id = NEW.id
              AND s.status = 'APPROVED'
              AND s.removed_at IS NULL
        )
        THEN RAISE(ABORT, 'competition_result_drafts_incomplete')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM competition_result_drafts d
            LEFT JOIN submissions s
              ON s.id = d.submission_id
             AND s.competition_id = d.competition_id
            WHERE d.competition_id = NEW.id
              AND (
                s.id IS NULL
                OR s.status <> 'APPROVED'
                OR s.removed_at IS NOT NULL
              )
        )
        THEN RAISE(ABORT, 'competition_result_drafts_include_ineligible_entry')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM competition_result_drafts d
            WHERE d.competition_id = NEW.id
              AND d.config_version <> NEW.current_config_version
        )
        THEN RAISE(ABORT, 'competition_result_drafts_stale_config')
    END;
END;
