PRAGMA foreign_keys = ON;

-- Extend the Discord outbox so contributor invite DMs retry independently from
-- Minecraft login reminders and staff-review webhooks.
CREATE TABLE competition_discord_outbox_v2 (
    id TEXT PRIMARY KEY,
    competition_id TEXT NOT NULL,
    submission_id TEXT,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'SUBMISSION_REVIEW','CONTRIBUTOR_INVITE'
    )),
    recipient_discord_user_id TEXT,
    operation_key TEXT NOT NULL UNIQUE,
    payload_json TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'PENDING' CHECK (state IN (
        'PENDING','DELIVERING','DELIVERED','FAILED'
    )),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TEXT NOT NULL,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    delivered_at TEXT,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_discord_user_id) REFERENCES competition_discord_accounts(discord_user_id) ON DELETE CASCADE
);

INSERT INTO competition_discord_outbox_v2 (
    id, competition_id, submission_id, event_type,
    recipient_discord_user_id, operation_key, payload_json, state,
    attempts, next_attempt_at, last_error, created_at, updated_at, delivered_at
)
SELECT
    id, competition_id, submission_id, event_type,
    NULL, operation_key, payload_json, state,
    attempts, next_attempt_at, last_error, created_at, updated_at, delivered_at
FROM competition_discord_outbox;

DROP TABLE competition_discord_outbox;
ALTER TABLE competition_discord_outbox_v2 RENAME TO competition_discord_outbox;

CREATE INDEX idx_competition_discord_pending
    ON competition_discord_outbox(state, next_attempt_at, created_at);
CREATE INDEX idx_competition_discord_recipient
    ON competition_discord_outbox(recipient_discord_user_id, event_type, state);

CREATE TRIGGER competition_submission_review_discord_notification
AFTER UPDATE OF status ON submissions
WHEN NEW.status = 'PENDING_REVIEW' AND OLD.status <> 'PENDING_REVIEW'
BEGIN
  INSERT OR IGNORE INTO competition_discord_outbox (
    id, competition_id, submission_id, event_type,
    recipient_discord_user_id, operation_key, payload_json,
    state, attempts, next_attempt_at, created_at, updated_at
  )
  SELECT
    lower(hex(randomblob(16))),
    NEW.competition_id,
    NEW.id,
    'SUBMISSION_REVIEW',
    NULL,
    'discord-submission-review:' || NEW.id || ':' || NEW.revision,
    json_object(
      'competitionTitle', c.title,
      'competitionSlug', c.slug,
      'submissionTitle', NEW.title,
      'ownerName', NEW.owner_name,
      'submissionId', NEW.id
    ),
    'PENDING',
    0,
    COALESCE(NEW.submitted_at, NEW.updated_at),
    COALESCE(NEW.submitted_at, NEW.updated_at),
    COALESCE(NEW.submitted_at, NEW.updated_at)
  FROM competitions c
  WHERE c.id = NEW.competition_id;
END;

-- Queue a DM immediately when an invite targets an already-linked account.
CREATE TRIGGER competition_contributor_invite_discord_notification
AFTER INSERT ON submission_participants
WHEN NEW.invite_status = 'PENDING'
  AND NEW.participant_role IN ('MAIN','HELPER','GUILD_WORKER')
BEGIN
  INSERT OR IGNORE INTO competition_discord_outbox (
    id, competition_id, submission_id, event_type,
    recipient_discord_user_id, operation_key, payload_json,
    state, attempts, next_attempt_at, created_at, updated_at
  )
  SELECT
    lower(hex(randomblob(16))),
    s.competition_id,
    s.id,
    'CONTRIBUTOR_INVITE',
    l.discord_user_id,
    'discord-contributor-invite:' || s.id || ':' || NEW.player_uuid || ':' || NEW.invited_at,
    json_object(
      'competitionTitle', c.title,
      'competitionSlug', c.slug,
      'submissionTitle', s.title,
      'playerName', NEW.player_name,
      'role', NEW.participant_role
    ),
    'PENDING',
    0,
    NEW.invited_at,
    NEW.invited_at,
    NEW.invited_at
  FROM submissions s
  JOIN competitions c ON c.id = s.competition_id
  JOIN competition_minecraft_links l ON l.minecraft_uuid = NEW.player_uuid
  WHERE s.id = NEW.submission_id;
END;

-- If the Minecraft account links after the invite was created, queue any still-
-- pending invite DMs at link time.
CREATE TRIGGER competition_pending_invites_after_minecraft_link
AFTER INSERT ON competition_minecraft_links
BEGIN
  INSERT OR IGNORE INTO competition_discord_outbox (
    id, competition_id, submission_id, event_type,
    recipient_discord_user_id, operation_key, payload_json,
    state, attempts, next_attempt_at, created_at, updated_at
  )
  SELECT
    lower(hex(randomblob(16))),
    s.competition_id,
    s.id,
    'CONTRIBUTOR_INVITE',
    NEW.discord_user_id,
    'discord-contributor-invite:' || s.id || ':' || p.player_uuid || ':' || p.invited_at,
    json_object(
      'competitionTitle', c.title,
      'competitionSlug', c.slug,
      'submissionTitle', s.title,
      'playerName', p.player_name,
      'role', p.participant_role
    ),
    'PENDING',
    0,
    NEW.linked_at,
    NEW.linked_at,
    NEW.linked_at
  FROM submission_participants p
  JOIN submissions s ON s.id = p.submission_id
  JOIN competitions c ON c.id = s.competition_id
  WHERE p.player_uuid = NEW.minecraft_uuid
    AND p.invite_status = 'PENDING'
    AND p.participant_role IN ('MAIN','HELPER','GUILD_WORKER');
END;

-- A delayed Discord retry must never send an invite that has already been
-- accepted/declined.
CREATE TRIGGER competition_contributor_invite_discord_cancel_on_response
AFTER UPDATE OF invite_status ON submission_participants
WHEN OLD.invite_status = 'PENDING' AND NEW.invite_status IN ('ACCEPTED','DECLINED')
BEGIN
  UPDATE competition_discord_outbox
  SET state = 'DELIVERED',
      delivered_at = COALESCE(NEW.responded_at, CURRENT_TIMESTAMP),
      updated_at = COALESCE(NEW.responded_at, CURRENT_TIMESTAMP),
      last_error = 'invite_no_longer_pending'
  WHERE submission_id = NEW.submission_id
    AND event_type = 'CONTRIBUTOR_INVITE'
    AND operation_key = 'discord-contributor-invite:' || NEW.submission_id || ':' || NEW.player_uuid || ':' || NEW.invited_at
    AND state IN ('PENDING','FAILED');
END;

CREATE TRIGGER competition_contributor_invite_discord_cancel_on_remove
AFTER DELETE ON submission_participants
WHEN OLD.invite_status = 'PENDING'
BEGIN
  UPDATE competition_discord_outbox
  SET state = 'DELIVERED',
      delivered_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP,
      last_error = 'invite_removed_before_delivery'
  WHERE submission_id = OLD.submission_id
    AND event_type = 'CONTRIBUTOR_INVITE'
    AND operation_key = 'discord-contributor-invite:' || OLD.submission_id || ':' || OLD.player_uuid || ':' || OLD.invited_at
    AND state IN ('PENDING','FAILED');
END;
