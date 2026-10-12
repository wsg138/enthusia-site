PRAGMA foreign_keys = ON;

-- Per-player entry limits apply to the durable Discord competition identity,
-- not to whichever linked Minecraft UUID happens to be selected for a request.
-- Current links and historical identity locks are both included so unlinking an
-- old participating account cannot reset the cap.
CREATE TRIGGER competition_linked_entry_limit_submission_insert
BEFORE INSERT ON submissions
WHEN NEW.entry_type IN ('SOLO','GROUP')
  AND NEW.owner_subject LIKE 'discord:%'
BEGIN
    SELECT CASE
        WHEN (
            WITH identity_uuids AS (
                SELECT minecraft_uuid
                FROM competition_minecraft_links
                WHERE discord_user_id = substr(NEW.owner_subject, 9)
                UNION
                SELECT minecraft_uuid
                FROM competition_minecraft_identity_locks
                WHERE discord_user_id = substr(NEW.owner_subject, 9)
            ), slot_rows AS (
                SELECT s.id AS submission_id
                FROM submissions s
                WHERE s.competition_id = NEW.competition_id
                  AND s.entry_type IN ('SOLO','GROUP')
                  AND (
                    s.owner_subject = NEW.owner_subject
                    OR s.owner_uuid IN (SELECT minecraft_uuid FROM identity_uuids)
                  )
                  AND s.status NOT IN ('WITHDRAWN','REMOVED','REJECTED','DISQUALIFIED')
                  AND s.removed_at IS NULL
                UNION
                SELECT p.submission_id
                FROM submission_participants p
                JOIN submissions s ON s.id = p.submission_id
                WHERE s.competition_id = NEW.competition_id
                  AND p.player_uuid IN (SELECT minecraft_uuid FROM identity_uuids)
                  AND p.invite_status = 'ACCEPTED'
                  AND p.participant_role = 'MAIN'
                  AND s.entry_type = 'GROUP'
                  AND s.status NOT IN ('WITHDRAWN','REMOVED','REJECTED','DISQUALIFIED')
                  AND s.removed_at IS NULL
            )
            SELECT COUNT(DISTINCT submission_id) FROM slot_rows
        ) >= COALESCE((
            SELECT CAST(json_extract(cv.config_json, '$.entries.maxEntriesPerPlayer') AS INTEGER)
            FROM competitions c
            JOIN competition_config_versions cv
              ON cv.competition_id = c.id
             AND cv.version = c.current_config_version
            WHERE c.id = NEW.competition_id
        ), 1)
        THEN RAISE(ABORT, 'competition_linked_entry_limit_reached')
    END;
END;

CREATE TRIGGER competition_linked_entry_limit_main_insert
BEFORE INSERT ON submission_participants
WHEN NEW.invite_status = 'ACCEPTED'
  AND NEW.participant_role = 'MAIN'
  AND EXISTS (
    SELECT 1 FROM competition_minecraft_links WHERE minecraft_uuid = NEW.player_uuid
    UNION ALL
    SELECT 1 FROM competition_minecraft_identity_locks WHERE minecraft_uuid = NEW.player_uuid
  )
BEGIN
    SELECT CASE
        WHEN (
            WITH discord_identity AS (
                SELECT discord_user_id
                FROM competition_minecraft_links
                WHERE minecraft_uuid = NEW.player_uuid
                UNION
                SELECT discord_user_id
                FROM competition_minecraft_identity_locks
                WHERE minecraft_uuid = NEW.player_uuid
                LIMIT 1
            ), identity_uuids AS (
                SELECT l.minecraft_uuid
                FROM competition_minecraft_links l
                WHERE l.discord_user_id = (SELECT discord_user_id FROM discord_identity)
                UNION
                SELECT lock.minecraft_uuid
                FROM competition_minecraft_identity_locks lock
                WHERE lock.discord_user_id = (SELECT discord_user_id FROM discord_identity)
            ), target_competition AS (
                SELECT competition_id
                FROM submissions
                WHERE id = NEW.submission_id
            ), slot_rows AS (
                SELECT s.id AS submission_id
                FROM submissions s
                WHERE s.competition_id = (SELECT competition_id FROM target_competition)
                  AND s.entry_type IN ('SOLO','GROUP')
                  AND (
                    s.owner_subject = 'discord:' || (SELECT discord_user_id FROM discord_identity)
                    OR s.owner_uuid IN (SELECT minecraft_uuid FROM identity_uuids)
                  )
                  AND s.status NOT IN ('WITHDRAWN','REMOVED','REJECTED','DISQUALIFIED')
                  AND s.removed_at IS NULL
                UNION
                SELECT p.submission_id
                FROM submission_participants p
                JOIN submissions s ON s.id = p.submission_id
                WHERE s.competition_id = (SELECT competition_id FROM target_competition)
                  AND p.player_uuid IN (SELECT minecraft_uuid FROM identity_uuids)
                  AND p.invite_status = 'ACCEPTED'
                  AND p.participant_role = 'MAIN'
                  AND s.entry_type = 'GROUP'
                  AND s.status NOT IN ('WITHDRAWN','REMOVED','REJECTED','DISQUALIFIED')
                  AND s.removed_at IS NULL
            )
            SELECT COUNT(DISTINCT submission_id) FROM slot_rows
        ) >= COALESCE((
            SELECT CAST(json_extract(cv.config_json, '$.entries.maxEntriesPerPlayer') AS INTEGER)
            FROM submissions target
            JOIN competitions c ON c.id = target.competition_id
            JOIN competition_config_versions cv
              ON cv.competition_id = c.id
             AND cv.version = c.current_config_version
            WHERE target.id = NEW.submission_id
        ), 1)
        THEN RAISE(ABORT, 'competition_linked_entry_limit_reached')
    END;
END;

CREATE TRIGGER competition_linked_entry_limit_main_update
BEFORE UPDATE OF player_uuid, participant_role, invite_status ON submission_participants
WHEN NEW.invite_status = 'ACCEPTED'
  AND NEW.participant_role = 'MAIN'
  AND NOT (OLD.invite_status = 'ACCEPTED' AND OLD.participant_role = 'MAIN' AND OLD.player_uuid = NEW.player_uuid)
  AND EXISTS (
    SELECT 1 FROM competition_minecraft_links WHERE minecraft_uuid = NEW.player_uuid
    UNION ALL
    SELECT 1 FROM competition_minecraft_identity_locks WHERE minecraft_uuid = NEW.player_uuid
  )
BEGIN
    SELECT CASE
        WHEN (
            WITH discord_identity AS (
                SELECT discord_user_id
                FROM competition_minecraft_links
                WHERE minecraft_uuid = NEW.player_uuid
                UNION
                SELECT discord_user_id
                FROM competition_minecraft_identity_locks
                WHERE minecraft_uuid = NEW.player_uuid
                LIMIT 1
            ), identity_uuids AS (
                SELECT l.minecraft_uuid
                FROM competition_minecraft_links l
                WHERE l.discord_user_id = (SELECT discord_user_id FROM discord_identity)
                UNION
                SELECT lock.minecraft_uuid
                FROM competition_minecraft_identity_locks lock
                WHERE lock.discord_user_id = (SELECT discord_user_id FROM discord_identity)
            ), target_competition AS (
                SELECT competition_id
                FROM submissions
                WHERE id = NEW.submission_id
            ), slot_rows AS (
                SELECT s.id AS submission_id
                FROM submissions s
                WHERE s.competition_id = (SELECT competition_id FROM target_competition)
                  AND s.entry_type IN ('SOLO','GROUP')
                  AND (
                    s.owner_subject = 'discord:' || (SELECT discord_user_id FROM discord_identity)
                    OR s.owner_uuid IN (SELECT minecraft_uuid FROM identity_uuids)
                  )
                  AND s.status NOT IN ('WITHDRAWN','REMOVED','REJECTED','DISQUALIFIED')
                  AND s.removed_at IS NULL
                UNION
                SELECT p.submission_id
                FROM submission_participants p
                JOIN submissions s ON s.id = p.submission_id
                WHERE s.competition_id = (SELECT competition_id FROM target_competition)
                  AND p.player_uuid IN (SELECT minecraft_uuid FROM identity_uuids)
                  AND p.invite_status = 'ACCEPTED'
                  AND p.participant_role = 'MAIN'
                  AND s.entry_type = 'GROUP'
                  AND s.status NOT IN ('WITHDRAWN','REMOVED','REJECTED','DISQUALIFIED')
                  AND s.removed_at IS NULL
            )
            SELECT COUNT(DISTINCT submission_id) FROM slot_rows
        ) >= COALESCE((
            SELECT CAST(json_extract(cv.config_json, '$.entries.maxEntriesPerPlayer') AS INTEGER)
            FROM submissions target
            JOIN competitions c ON c.id = target.competition_id
            JOIN competition_config_versions cv
              ON cv.competition_id = c.id
             AND cv.version = c.current_config_version
            WHERE target.id = NEW.submission_id
        ), 1)
        THEN RAISE(ABORT, 'competition_linked_entry_limit_reached')
    END;
END;
