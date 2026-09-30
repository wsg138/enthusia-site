PRAGMA foreign_keys = ON;

CREATE TRIGGER competition_results_guard_completion
BEFORE UPDATE OF lifecycle_state ON competitions
WHEN NEW.lifecycle_state = 'COMPLETED' AND OLD.lifecycle_state = 'RESULTS_READY'
BEGIN
    SELECT CASE
        WHEN (
            SELECT COUNT(*)
            FROM submissions s
            WHERE s.competition_id = OLD.id
              AND s.status = 'APPROVED'
              AND s.removed_at IS NULL
        ) < 1
        THEN RAISE(ABORT, 'competition_results_no_approved_entries')
    END;

    SELECT CASE
        WHEN (
            SELECT COUNT(*)
            FROM competition_results r
            JOIN submissions s
              ON s.id = r.submission_id
             AND s.competition_id = r.competition_id
            WHERE r.competition_id = OLD.id
              AND s.status = 'APPROVED'
              AND s.removed_at IS NULL
        ) <> (
            SELECT COUNT(*)
            FROM submissions s
            WHERE s.competition_id = OLD.id
              AND s.status = 'APPROVED'
              AND s.removed_at IS NULL
        )
        THEN RAISE(ABORT, 'competition_results_incomplete')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM competition_results r
            LEFT JOIN submissions s
              ON s.id = r.submission_id
             AND s.competition_id = r.competition_id
            WHERE r.competition_id = OLD.id
              AND (
                s.id IS NULL
                OR s.status <> 'APPROVED'
                OR s.removed_at IS NOT NULL
              )
        )
        THEN RAISE(ABORT, 'competition_results_include_ineligible_entry')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM competition_results r
            WHERE r.competition_id = OLD.id
              AND r.config_version <> OLD.current_config_version
        )
        THEN RAISE(ABORT, 'competition_results_stale_config')
    END;
END;
