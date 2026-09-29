PRAGMA foreign_keys = ON;

ALTER TABLE appeal_submissions
    ADD COLUMN current_claimed INTEGER NOT NULL DEFAULT 0
        CHECK (current_claimed IN (0, 1));

DROP TRIGGER IF EXISTS appeal_submission_payload_immutable;

CREATE TRIGGER appeal_submission_identity_immutable
BEFORE UPDATE ON appeal_submissions
FOR EACH ROW
WHEN OLD.draft_id <> NEW.draft_id
  OR OLD.owner_discord_id <> NEW.owner_discord_id
  OR OLD.minecraft_uuid <> NEW.minecraft_uuid
  OR OLD.minecraft_name <> NEW.minecraft_name
  OR OLD.punishment_id <> NEW.punishment_id
  OR OLD.attachment_ids_json <> NEW.attachment_ids_json
  OR OLD.payload_hash <> NEW.payload_hash
BEGIN
    SELECT RAISE(ABORT, 'appeal_submission_identity_immutable');
END;
