PRAGMA foreign_keys = ON;

-- Defense-in-depth for staff self-review. Application code additionally checks
-- live guild membership through the Minecraft bridge; D1 can independently
-- prevent direct and Discord-linked owner/participant conflicts.
CREATE TRIGGER competition_staff_moderation_conflict_insert
BEFORE INSERT ON submission_moderation
WHEN NEW.reviewed_by_uuid IS NOT NULL
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM submissions s
            WHERE s.id = NEW.submission_id
              AND s.owner_uuid = NEW.reviewed_by_uuid
        )
        THEN RAISE(ABORT, 'competition_staff_self_moderation')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM submission_participants p
            WHERE p.submission_id = NEW.submission_id
              AND p.player_uuid = NEW.reviewed_by_uuid
              AND p.invite_status = 'ACCEPTED'
        )
        THEN RAISE(ABORT, 'competition_staff_self_moderation')
    END;

    SELECT CASE
        WHEN EXISTS (
            WITH reviewer_discord AS (
                SELECT discord_user_id FROM competition_minecraft_links WHERE minecraft_uuid = NEW.reviewed_by_uuid
                UNION
                SELECT discord_user_id FROM competition_minecraft_identity_locks WHERE minecraft_uuid = NEW.reviewed_by_uuid
            ), reviewer_uuids AS (
                SELECT minecraft_uuid FROM competition_minecraft_links WHERE discord_user_id IN (SELECT discord_user_id FROM reviewer_discord)
                UNION
                SELECT minecraft_uuid FROM competition_minecraft_identity_locks WHERE discord_user_id IN (SELECT discord_user_id FROM reviewer_discord)
            )
            SELECT 1
            FROM submissions s
            WHERE s.id = NEW.submission_id
              AND (
                  s.owner_uuid IN (SELECT minecraft_uuid FROM reviewer_uuids)
                  OR EXISTS (
                      SELECT 1
                      FROM submission_participants p
                      WHERE p.submission_id = s.id
                        AND p.invite_status = 'ACCEPTED'
                        AND p.player_uuid IN (SELECT minecraft_uuid FROM reviewer_uuids)
                  )
              )
        )
        THEN RAISE(ABORT, 'competition_staff_linked_self_moderation')
    END;
END;

CREATE TRIGGER competition_staff_moderation_conflict_update
BEFORE UPDATE OF reviewed_by_uuid ON submission_moderation
WHEN NEW.reviewed_by_uuid IS NOT NULL
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM submissions s
            WHERE s.id = NEW.submission_id
              AND s.owner_uuid = NEW.reviewed_by_uuid
        )
        OR EXISTS (
            SELECT 1
            FROM submission_participants p
            WHERE p.submission_id = NEW.submission_id
              AND p.player_uuid = NEW.reviewed_by_uuid
              AND p.invite_status = 'ACCEPTED'
        )
        THEN RAISE(ABORT, 'competition_staff_self_moderation')
    END;

    SELECT CASE
        WHEN EXISTS (
            WITH reviewer_discord AS (
                SELECT discord_user_id FROM competition_minecraft_links WHERE minecraft_uuid = NEW.reviewed_by_uuid
                UNION
                SELECT discord_user_id FROM competition_minecraft_identity_locks WHERE minecraft_uuid = NEW.reviewed_by_uuid
            ), reviewer_uuids AS (
                SELECT minecraft_uuid FROM competition_minecraft_links WHERE discord_user_id IN (SELECT discord_user_id FROM reviewer_discord)
                UNION
                SELECT minecraft_uuid FROM competition_minecraft_identity_locks WHERE discord_user_id IN (SELECT discord_user_id FROM reviewer_discord)
            )
            SELECT 1
            FROM submissions s
            WHERE s.id = NEW.submission_id
              AND (
                  s.owner_uuid IN (SELECT minecraft_uuid FROM reviewer_uuids)
                  OR EXISTS (
                      SELECT 1
                      FROM submission_participants p
                      WHERE p.submission_id = s.id
                        AND p.invite_status = 'ACCEPTED'
                        AND p.player_uuid IN (SELECT minecraft_uuid FROM reviewer_uuids)
                  )
              )
        )
        THEN RAISE(ABORT, 'competition_staff_linked_self_moderation')
    END;
END;
