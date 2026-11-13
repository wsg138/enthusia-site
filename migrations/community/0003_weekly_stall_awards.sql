-- Only operator-reviewed closed-week results belong here. No poller writes this table.
-- A row with all winner fields NULL is a verified week with no qualifying sales.
CREATE TABLE IF NOT EXISTS market_weekly_stall_awards (
  week TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('player', 'guild')),
  stall_id TEXT,
  owner_name TEXT,
  representative_uuid TEXT,
  PRIMARY KEY (week, category),
  CHECK (
    (stall_id IS NULL AND owner_name IS NULL AND representative_uuid IS NULL)
    OR (stall_id IS NOT NULL AND length(stall_id) BETWEEN 1 AND 80
      AND owner_name IS NOT NULL AND length(owner_name) BETWEEN 1 AND 48
      AND representative_uuid IS NOT NULL AND length(representative_uuid) = 36)
  )
);
