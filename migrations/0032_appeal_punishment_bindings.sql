PRAGMA foreign_keys = ON;

CREATE TABLE appeal_punishment_bindings (
    punishment_id TEXT PRIMARY KEY,
    owner_discord_id TEXT NOT NULL,
    case_id TEXT NOT NULL,
    code_generation INTEGER NOT NULL CHECK (code_generation >= 1),
    punishment_type TEXT NOT NULL,
    bound_username TEXT NOT NULL,
    eligible INTEGER NOT NULL CHECK (eligible IN (0, 1)),
    eligibility_state TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_validated_at TEXT NOT NULL,
    FOREIGN KEY (owner_discord_id) REFERENCES competition_discord_accounts(discord_user_id) ON DELETE CASCADE
);

CREATE INDEX idx_appeal_punishment_bindings_owner
    ON appeal_punishment_bindings(owner_discord_id, updated_at DESC);

PRAGMA optimize;
