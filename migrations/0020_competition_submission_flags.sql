PRAGMA foreign_keys = ON;

ALTER TABLE submission_moderation ADD COLUMN flag_reason TEXT;
ALTER TABLE submission_moderation ADD COLUMN flagged_by_uuid TEXT;
ALTER TABLE submission_moderation ADD COLUMN flagged_at TEXT;
