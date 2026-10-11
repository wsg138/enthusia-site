CREATE TABLE IF NOT EXISTS community_records (
 kind TEXT NOT NULL, slug TEXT NOT NULL, status TEXT NOT NULL,
 payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 editor TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(kind,slug)
);
CREATE INDEX IF NOT EXISTS community_public_records ON community_records(kind,status,updated_at);
CREATE TABLE IF NOT EXISTS community_votes (
 poll TEXT NOT NULL, voter TEXT NOT NULL, choice INTEGER NOT NULL,
 updated_at TEXT NOT NULL, PRIMARY KEY(poll,voter)
);
CREATE TABLE IF NOT EXISTS community_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL,
 kind TEXT NOT NULL, slug TEXT NOT NULL, revision INTEGER NOT NULL, occurred_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS community_snapshots (
 kind TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS community_nonces (nonce TEXT PRIMARY KEY, occurred_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS market_sales (
 id TEXT PRIMARY KEY, stall TEXT NOT NULL, guild TEXT NOT NULL, item TEXT NOT NULL,
 quantity REAL NOT NULL CHECK(quantity > 0), gold REAL NOT NULL CHECK(gold > 0), occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS market_sales_time ON market_sales(occurred_at);
CREATE INDEX IF NOT EXISTS market_sales_item_time ON market_sales(item,occurred_at);
CREATE TABLE IF NOT EXISTS market_alerts (
 subscriber TEXT NOT NULL, item TEXT NOT NULL, threshold REAL NOT NULL CHECK(threshold > 0),
 updated_at TEXT NOT NULL, last_attempt_at TEXT, last_sent_at TEXT, PRIMARY KEY(subscriber,item)
);
