PRAGMA foreign_keys = ON;

ALTER TABLE competitions ADD COLUMN last_results_operation_id TEXT;
CREATE UNIQUE INDEX idx_competitions_results_operation_id
    ON competitions(last_results_operation_id)
    WHERE last_results_operation_id IS NOT NULL;

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
