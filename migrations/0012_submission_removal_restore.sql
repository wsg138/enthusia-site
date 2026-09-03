PRAGMA foreign_keys = ON;

ALTER TABLE submissions ADD COLUMN removed_previous_status TEXT;
ALTER TABLE submissions ADD COLUMN removed_by_uuid TEXT;

CREATE TRIGGER submission_removed_previous_status_guard
BEFORE UPDATE OF removed_at ON submissions
WHEN OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL
BEGIN
    SELECT CASE
        WHEN NEW.removed_previous_status IS NULL
          OR NEW.removed_previous_status NOT IN (
            'DRAFT','PENDING_REVIEW','NEEDS_CHANGES','APPROVED','REJECTED','DISQUALIFIED','WITHDRAWN'
          )
        THEN RAISE(ABORT, 'submission_removed_previous_status_required')
    END;
END;

CREATE TRIGGER submission_restore_status_guard
BEFORE UPDATE OF removed_at ON submissions
WHEN OLD.removed_at IS NOT NULL AND NEW.removed_at IS NULL
BEGIN
    SELECT CASE
        WHEN NEW.status NOT IN (
          'DRAFT','PENDING_REVIEW','NEEDS_CHANGES','APPROVED','REJECTED','DISQUALIFIED','WITHDRAWN'
        )
        THEN RAISE(ABORT, 'submission_restore_status_invalid')
    END;
END;
