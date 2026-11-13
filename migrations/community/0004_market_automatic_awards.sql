CREATE TABLE IF NOT EXISTS market_sale_award_owners (
  sale_id TEXT PRIMARY KEY REFERENCES market_sales(id),
  category TEXT NOT NULL CHECK(category IN ('player', 'guild')),
  owner_id TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  representative_uuid TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS market_award_coverage (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  generation TEXT NOT NULL,
  capture_from TEXT NOT NULL,
  captured_through TEXT NOT NULL,
  observed_at TEXT NOT NULL
);
