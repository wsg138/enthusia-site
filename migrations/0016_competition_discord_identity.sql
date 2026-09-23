PRAGMA foreign_keys = ON;

CREATE TABLE competition_discord_accounts (
    discord_user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    global_name TEXT,
    avatar_hash TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE competition_identity_sessions (
    session_hash TEXT PRIMARY KEY,
    discord_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    FOREIGN KEY (discord_user_id) REFERENCES competition_discord_accounts(discord_user_id) ON DELETE CASCADE
);

CREATE INDEX idx_competition_identity_sessions_user
    ON competition_identity_sessions(discord_user_id, expires_at);
CREATE INDEX idx_competition_identity_sessions_expiry
    ON competition_identity_sessions(expires_at);

CREATE TABLE competition_oauth_states (
    state_hash TEXT PRIMARY KEY,
    return_to TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE INDEX idx_competition_oauth_states_expiry
    ON competition_oauth_states(expires_at);

CREATE TABLE competition_minecraft_links (
    minecraft_uuid TEXT PRIMARY KEY,
    discord_user_id TEXT NOT NULL,
    minecraft_name TEXT NOT NULL,
    linked_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (discord_user_id) REFERENCES competition_discord_accounts(discord_user_id) ON DELETE CASCADE
);

CREATE INDEX idx_competition_minecraft_links_discord
    ON competition_minecraft_links(discord_user_id, linked_at, minecraft_uuid);

CREATE TABLE competition_link_codes (
    code_hash TEXT PRIMARY KEY,
    discord_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    FOREIGN KEY (discord_user_id) REFERENCES competition_discord_accounts(discord_user_id) ON DELETE CASCADE
);

CREATE INDEX idx_competition_link_codes_user
    ON competition_link_codes(discord_user_id, expires_at);
CREATE INDEX idx_competition_link_codes_expiry
    ON competition_link_codes(expires_at);
