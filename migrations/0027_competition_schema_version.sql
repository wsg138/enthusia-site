PRAGMA foreign_keys = ON;

-- The runtime readiness endpoint must be able to prove that every migration in
-- the release candidate was applied, not merely that a few early tables exist.
CREATE TABLE competition_schema_meta (
    schema_key TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
    updated_at TEXT NOT NULL
);

INSERT INTO competition_schema_meta (schema_key, schema_version, updated_at)
VALUES ('core', 27, CURRENT_TIMESTAMP)
ON CONFLICT(schema_key) DO UPDATE SET
    schema_version = excluded.schema_version,
    updated_at = excluded.updated_at;
