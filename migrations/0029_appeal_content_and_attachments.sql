PRAGMA foreign_keys = ON;

CREATE TABLE appeal_submissions (
    draft_id TEXT PRIMARY KEY,
    appeal_id TEXT UNIQUE,
    owner_discord_id TEXT NOT NULL,
    minecraft_uuid TEXT NOT NULL,
    minecraft_name TEXT NOT NULL,
    punishment_id TEXT NOT NULL,
    answers_json TEXT NOT NULL CHECK (length(answers_json) BETWEEN 2 AND 20000),
    attachment_ids_json TEXT NOT NULL CHECK (length(attachment_ids_json) BETWEEN 2 AND 512),
    staff_reason TEXT NOT NULL CHECK (length(staff_reason) BETWEEN 10 AND 1000),
    payload_hash TEXT NOT NULL UNIQUE CHECK (length(payload_hash) = 64),
    status TEXT NOT NULL CHECK (status IN ('PREPARING', 'SUBMITTED')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    submitted_at TEXT,
    FOREIGN KEY (owner_discord_id) REFERENCES competition_discord_accounts(discord_user_id) ON DELETE CASCADE
);

CREATE INDEX idx_appeal_submissions_owner
    ON appeal_submissions(owner_discord_id, created_at DESC);
CREATE INDEX idx_appeal_submissions_status
    ON appeal_submissions(status, expires_at);

CREATE TABLE appeal_attachments (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL,
    appeal_id TEXT,
    owner_discord_id TEXT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'text/plain')),
    byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 8388608),
    sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
    width INTEGER,
    height INTEGER,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attached_at TEXT,
    FOREIGN KEY (owner_discord_id) REFERENCES competition_discord_accounts(discord_user_id) ON DELETE CASCADE,
    FOREIGN KEY (appeal_id) REFERENCES appeal_submissions(appeal_id)
);

CREATE INDEX idx_appeal_attachments_draft
    ON appeal_attachments(owner_discord_id, draft_id, created_at);
CREATE INDEX idx_appeal_attachments_appeal
    ON appeal_attachments(appeal_id, created_at);
CREATE INDEX idx_appeal_attachments_expiry
    ON appeal_attachments(expires_at);

CREATE TRIGGER appeal_submission_payload_immutable
BEFORE UPDATE ON appeal_submissions
FOR EACH ROW
WHEN OLD.owner_discord_id <> NEW.owner_discord_id
  OR OLD.minecraft_uuid <> NEW.minecraft_uuid
  OR OLD.minecraft_name <> NEW.minecraft_name
  OR OLD.punishment_id <> NEW.punishment_id
  OR OLD.answers_json <> NEW.answers_json
  OR OLD.attachment_ids_json <> NEW.attachment_ids_json
  OR OLD.staff_reason <> NEW.staff_reason
  OR OLD.payload_hash <> NEW.payload_hash
BEGIN
    SELECT RAISE(ABORT, 'appeal_submission_payload_immutable');
END;

CREATE TRIGGER appeal_attachment_binding_immutable
BEFORE UPDATE OF appeal_id ON appeal_attachments
FOR EACH ROW
WHEN OLD.appeal_id IS NOT NULL AND NEW.appeal_id IS NOT OLD.appeal_id
BEGIN
    SELECT RAISE(ABORT, 'appeal_attachment_binding_immutable');
END;

CREATE TRIGGER appeal_attachment_draft_locked
BEFORE INSERT ON appeal_attachments
FOR EACH ROW
WHEN EXISTS (
    SELECT 1 FROM appeal_submissions WHERE draft_id = NEW.draft_id
)
BEGIN
    SELECT RAISE(ABORT, 'appeal_attachment_draft_locked');
END;

CREATE TRIGGER appeal_attachment_count_guard
BEFORE INSERT ON appeal_attachments
FOR EACH ROW
WHEN (
    SELECT COUNT(*) FROM appeal_attachments
    WHERE owner_discord_id = NEW.owner_discord_id
      AND draft_id = NEW.draft_id
      AND appeal_id IS NULL
      AND expires_at > NEW.created_at
) >= 5
BEGIN
    SELECT RAISE(ABORT, 'appeal_attachment_limit_reached');
END;

CREATE TRIGGER appeal_attachment_size_guard
BEFORE INSERT ON appeal_attachments
FOR EACH ROW
WHEN COALESCE((
    SELECT SUM(byte_size) FROM appeal_attachments
    WHERE owner_discord_id = NEW.owner_discord_id
      AND draft_id = NEW.draft_id
      AND appeal_id IS NULL
      AND expires_at > NEW.created_at
), 0) + NEW.byte_size > 20971520
BEGIN
    SELECT RAISE(ABORT, 'appeal_attachment_total_too_large');
END;
