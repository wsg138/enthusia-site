PRAGMA foreign_keys = ON;

CREATE TABLE appeal_punishment_bindings_v2 (
    punishment_id TEXT PRIMARY KEY,
    owner_identity TEXT NOT NULL,
    case_id TEXT NOT NULL,
    code_generation INTEGER NOT NULL CHECK (code_generation >= 1),
    punishment_type TEXT NOT NULL,
    bound_username TEXT NOT NULL,
    eligible INTEGER NOT NULL CHECK (eligible IN (0, 1)),
    eligibility_state TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_validated_at TEXT NOT NULL
);

INSERT INTO appeal_punishment_bindings_v2 (
    punishment_id, owner_identity, case_id, code_generation, punishment_type,
    bound_username, eligible, eligibility_state, created_at, updated_at, last_validated_at
)
SELECT
    punishment_id, 'discord:' || owner_discord_id, case_id, code_generation, punishment_type,
    bound_username, eligible, eligibility_state, created_at, updated_at, last_validated_at
FROM appeal_punishment_bindings;

DROP TABLE appeal_punishment_bindings;
ALTER TABLE appeal_punishment_bindings_v2 RENAME TO appeal_punishment_bindings;

CREATE INDEX idx_appeal_punishment_bindings_owner
    ON appeal_punishment_bindings(owner_identity, updated_at DESC);

CREATE TABLE appeal_email_accounts (
    account_id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_iterations INTEGER NOT NULL CHECK (password_iterations >= 100000),
    verified_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE appeal_email_verifications (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    FOREIGN KEY (account_id) REFERENCES appeal_email_accounts(account_id) ON DELETE CASCADE
);

CREATE INDEX idx_appeal_email_verifications_account
    ON appeal_email_verifications(account_id, expires_at);

CREATE TABLE appeal_email_sessions (
    session_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES appeal_email_accounts(account_id) ON DELETE CASCADE
);

CREATE INDEX idx_appeal_email_sessions_account
    ON appeal_email_sessions(account_id, expires_at);
CREATE INDEX idx_appeal_email_sessions_expiry
    ON appeal_email_sessions(expires_at);

PRAGMA optimize;
