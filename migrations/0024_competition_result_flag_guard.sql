PRAGMA foreign_keys = ON;

-- Publication readiness checks open flags before the result batch is built. This
-- trigger closes the race where a staff investigation flag could be opened after
-- that check but before the final result rows are inserted.
CREATE TRIGGER competition_result_open_flag_guard
BEFORE INSERT ON competition_results
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM submission_moderation sm
            JOIN submissions s ON s.id = sm.submission_id
            WHERE s.competition_id = NEW.competition_id
              AND s.status = 'APPROVED'
              AND s.removed_at IS NULL
              AND sm.flagged_at IS NOT NULL
              AND sm.flag_reason IS NOT NULL
        )
        THEN RAISE(ABORT, 'competition_results_open_flags')
    END;
END;
