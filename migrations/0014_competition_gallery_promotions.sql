PRAGMA foreign_keys = ON;

CREATE TABLE competition_gallery_promotions (
  id TEXT PRIMARY KEY,
  competition_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  image_id TEXT NOT NULL,
  title TEXT,
  caption TEXT,
  promoted_by_uuid TEXT NOT NULL,
  promoted_at TEXT NOT NULL,
  removed_at TEXT,
  removed_by_uuid TEXT,
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (image_id) REFERENCES submission_images(id) ON DELETE CASCADE,
  UNIQUE (submission_id, image_id)
);

CREATE INDEX idx_competition_gallery_public
  ON competition_gallery_promotions(removed_at, promoted_at DESC);
CREATE INDEX idx_competition_gallery_submission
  ON competition_gallery_promotions(submission_id, removed_at);
