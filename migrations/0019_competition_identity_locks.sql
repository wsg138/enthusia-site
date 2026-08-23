PRAGMA foreign_keys = ON;

CREATE TABLE competition_minecraft_identity_locks (
    minecraft_uuid TEXT PRIMARY KEY,
    discord_user_id TEXT NOT NULL,
    locked_at TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('SUBMISSION','PARTICIPANT','VOTE','JUDGE','EXISTING_HISTORY')),
    FOREIGN KEY (discord_user_id) REFERENCES competition_discord_accounts(discord_user_id) ON DELETE RESTRICT
);

CREATE INDEX idx_competition_identity_locks_discord
    ON competition_minecraft_identity_locks(discord_user_id, locked_at);

-- Backfill identities whose historical rows already carry a Discord subject.
INSERT OR IGNORE INTO competition_minecraft_identity_locks (
    minecraft_uuid, discord_user_id, locked_at, reason
)
SELECT owner_uuid, substr(owner_subject, 9), created_at, 'EXISTING_HISTORY'
FROM submissions
WHERE owner_subject LIKE 'discord:%';

INSERT OR IGNORE INTO competition_minecraft_identity_locks (
    minecraft_uuid, discord_user_id, locked_at, reason
)
SELECT voter_uuid, substr(voter_subject, 9), created_at, 'EXISTING_HISTORY'
FROM votes
WHERE voter_subject LIKE 'discord:%';

-- For participant/judge history created before this migration, the current link
-- is the only authoritative Discord identity available. Preserve it now.
INSERT OR IGNORE INTO competition_minecraft_identity_locks (
    minecraft_uuid, discord_user_id, locked_at, reason
)
SELECT DISTINCT p.player_uuid, l.discord_user_id, p.invited_at, 'EXISTING_HISTORY'
FROM submission_participants p
JOIN competition_minecraft_links l ON l.minecraft_uuid = p.player_uuid
WHERE p.invite_status = 'ACCEPTED';

INSERT OR IGNORE INTO competition_minecraft_identity_locks (
    minecraft_uuid, discord_user_id, locked_at, reason
)
SELECT DISTINCT j.judge_uuid, l.discord_user_id, j.assigned_at, 'EXISTING_HISTORY'
FROM competition_judges j
JOIN competition_minecraft_links l ON l.minecraft_uuid = j.judge_uuid;

CREATE TRIGGER competition_minecraft_link_identity_lock_insert
BEFORE INSERT ON competition_minecraft_links
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM competition_minecraft_identity_locks lock
            WHERE lock.minecraft_uuid = NEW.minecraft_uuid
              AND lock.discord_user_id <> NEW.discord_user_id
        )
        THEN RAISE(ABORT, 'minecraft_identity_locked_to_another_discord')
    END;
END;

CREATE TRIGGER competition_minecraft_link_identity_lock_update
BEFORE UPDATE OF discord_user_id ON competition_minecraft_links
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM competition_minecraft_identity_locks lock
            WHERE lock.minecraft_uuid = NEW.minecraft_uuid
              AND lock.discord_user_id <> NEW.discord_user_id
        )
        THEN RAISE(ABORT, 'minecraft_identity_locked_to_another_discord')
    END;
END;

-- If a previously unlinked player already has participant/judge history, their
-- first successful Discord link becomes the durable identity owner.
CREATE TRIGGER competition_minecraft_link_existing_history_lock
AFTER INSERT ON competition_minecraft_links
WHEN EXISTS (
    SELECT 1 FROM submission_participants p
    WHERE p.player_uuid = NEW.minecraft_uuid AND p.invite_status = 'ACCEPTED'
    UNION ALL
    SELECT 1 FROM competition_judges j
    WHERE j.judge_uuid = NEW.minecraft_uuid
)
BEGIN
    INSERT OR IGNORE INTO competition_minecraft_identity_locks (
        minecraft_uuid, discord_user_id, locked_at, reason
    ) VALUES (
        NEW.minecraft_uuid,
        NEW.discord_user_id,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        'EXISTING_HISTORY'
    );
END;

CREATE TRIGGER competition_submission_identity_lock
AFTER INSERT ON submissions
WHEN NEW.owner_subject LIKE 'discord:%'
BEGIN
    INSERT INTO competition_minecraft_identity_locks (
        minecraft_uuid, discord_user_id, locked_at, reason
    ) VALUES (
        NEW.owner_uuid,
        substr(NEW.owner_subject, 9),
        NEW.created_at,
        'SUBMISSION'
    )
    ON CONFLICT(minecraft_uuid) DO UPDATE SET
        discord_user_id = competition_minecraft_identity_locks.discord_user_id
    WHERE competition_minecraft_identity_locks.discord_user_id = excluded.discord_user_id;

    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM competition_minecraft_identity_locks lock
            WHERE lock.minecraft_uuid = NEW.owner_uuid
              AND lock.discord_user_id = substr(NEW.owner_subject, 9)
        )
        THEN RAISE(ABORT, 'minecraft_identity_locked_to_another_discord')
    END;
END;

CREATE TRIGGER competition_participant_identity_lock_insert
AFTER INSERT ON submission_participants
WHEN NEW.invite_status = 'ACCEPTED'
BEGIN
    INSERT OR IGNORE INTO competition_minecraft_identity_locks (
        minecraft_uuid, discord_user_id, locked_at, reason
    )
    SELECT NEW.player_uuid, l.discord_user_id, NEW.invited_at, 'PARTICIPANT'
    FROM competition_minecraft_links l
    WHERE l.minecraft_uuid = NEW.player_uuid;
END;

CREATE TRIGGER competition_participant_identity_lock_accept
AFTER UPDATE OF invite_status ON submission_participants
WHEN NEW.invite_status = 'ACCEPTED' AND OLD.invite_status <> 'ACCEPTED'
BEGIN
    INSERT OR IGNORE INTO competition_minecraft_identity_locks (
        minecraft_uuid, discord_user_id, locked_at, reason
    )
    SELECT NEW.player_uuid, l.discord_user_id, COALESCE(NEW.responded_at, NEW.invited_at), 'PARTICIPANT'
    FROM competition_minecraft_links l
    WHERE l.minecraft_uuid = NEW.player_uuid;
END;

CREATE TRIGGER competition_vote_identity_lock
AFTER INSERT ON votes
WHEN NEW.voter_subject LIKE 'discord:%'
BEGIN
    INSERT INTO competition_minecraft_identity_locks (
        minecraft_uuid, discord_user_id, locked_at, reason
    ) VALUES (
        NEW.voter_uuid,
        substr(NEW.voter_subject, 9),
        NEW.created_at,
        'VOTE'
    )
    ON CONFLICT(minecraft_uuid) DO UPDATE SET
        discord_user_id = competition_minecraft_identity_locks.discord_user_id
    WHERE competition_minecraft_identity_locks.discord_user_id = excluded.discord_user_id;
END;

CREATE TRIGGER competition_judge_identity_lock
AFTER INSERT ON competition_judges
BEGIN
    INSERT OR IGNORE INTO competition_minecraft_identity_locks (
        minecraft_uuid, discord_user_id, locked_at, reason
    )
    SELECT NEW.judge_uuid, l.discord_user_id, NEW.assigned_at, 'JUDGE'
    FROM competition_minecraft_links l
    WHERE l.minecraft_uuid = NEW.judge_uuid;
END;
