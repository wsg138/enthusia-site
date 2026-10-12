PRAGMA foreign_keys = ON;

CREATE TABLE competition_deleted_drafts (
  competition_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  deleted_by_subject TEXT NOT NULL,
  deleted_by_uuid TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  reason TEXT NOT NULL
);

CREATE INDEX idx_competition_deleted_drafts_time
  ON competition_deleted_drafts(deleted_at DESC);
