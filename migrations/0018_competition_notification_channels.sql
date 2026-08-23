PRAGMA foreign_keys = ON;

-- Track delivery per channel so retrying one failed notification channel never
-- duplicates a notification that already reached the other channel.
ALTER TABLE competition_notification_outbox ADD COLUMN bridge_delivered_at TEXT;
ALTER TABLE competition_notification_outbox ADD COLUMN discord_delivered_at TEXT;
