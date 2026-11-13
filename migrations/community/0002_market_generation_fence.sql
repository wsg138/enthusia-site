-- No generation is activated by this migration. An operator-reviewed
-- reconciliation must create the singleton state before any v2 write.
CREATE TABLE IF NOT EXISTS market_generation_state (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  generation TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision >= 0),
  mode TEXT NOT NULL CHECK(mode IN ('active', 'reconcile'))
);
CREATE TABLE IF NOT EXISTS market_fence_assertion (
  valid INTEGER NOT NULL CHECK(valid = 1)
);
-- Records observed generations within this database's lifetime. An external
-- restore can roll this history back, so it is not an independent restore log.
CREATE TABLE IF NOT EXISTS market_generation_history (
  generation TEXT PRIMARY KEY NOT NULL
);
