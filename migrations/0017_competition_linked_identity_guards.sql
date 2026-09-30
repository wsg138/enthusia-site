PRAGMA foreign_keys = ON;

-- Discord is the competition account boundary. Once Minecraft accounts are
-- linked to a Discord account, fairness rules must apply across every linked
-- Minecraft identity rather than only the UUID carried by one request.

CREATE TRIGGER competition_vote_linked_identity_guard
BEFORE INSERT ON votes
WHEN NEW.voter_subject LIKE 'discord:%'
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1
            FROM competition_minecraft_links l
            WHERE l.discord_user_id = substr(NEW.voter_subject, 9)
              AND l.minecraft_uuid = NEW.voter_uuid
        )
        THEN RAISE(ABORT, 'competition_vote_identity_mismatch')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM competition_minecraft_links l
            JOIN competition_judges j
              ON j.judge_uuid = l.minecraft_uuid
             AND j.competition_id = NEW.competition_id
            WHERE l.discord_user_id = substr(NEW.voter_subject, 9)
        )
        THEN RAISE(ABORT, 'competition_linked_judge_cannot_vote')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM competition_minecraft_links l
            JOIN submissions s
              ON s.owner_uuid = l.minecraft_uuid
             AND s.id = NEW.submission_id
            WHERE l.discord_user_id = substr(NEW.voter_subject, 9)
        )
        THEN RAISE(ABORT, 'competition_linked_owner_cannot_vote_own_entry')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM competition_minecraft_links l
            JOIN submission_participants p
              ON p.player_uuid = l.minecraft_uuid
             AND p.submission_id = NEW.submission_id
            WHERE l.discord_user_id = substr(NEW.voter_subject, 9)
              AND p.invite_status = 'ACCEPTED'
              AND p.participant_role IN ('OWNER','MAIN','GUILD_WORKER')
        )
        THEN RAISE(ABORT, 'competition_linked_participant_cannot_vote_own_entry')
    END;
END;

CREATE TRIGGER competition_judge_linked_identity_guard
BEFORE INSERT ON competition_judges
WHEN NEW.removed_at IS NULL
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM competition_minecraft_links selected
            JOIN competition_minecraft_links linked
              ON linked.discord_user_id = selected.discord_user_id
            JOIN submissions s
              ON s.competition_id = NEW.competition_id
             AND s.owner_uuid = linked.minecraft_uuid
            WHERE selected.minecraft_uuid = NEW.judge_uuid
              AND s.withdrawn_at IS NULL
              AND s.removed_at IS NULL
        )
        THEN RAISE(ABORT, 'competition_linked_judge_is_submission_owner')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM competition_minecraft_links selected
            JOIN competition_minecraft_links linked
              ON linked.discord_user_id = selected.discord_user_id
            JOIN submission_participants p
              ON p.player_uuid = linked.minecraft_uuid
            JOIN submissions s
              ON s.id = p.submission_id
             AND s.competition_id = NEW.competition_id
            WHERE selected.minecraft_uuid = NEW.judge_uuid
              AND p.invite_status = 'ACCEPTED'
              AND p.participant_role <> 'HELPER'
              AND s.withdrawn_at IS NULL
              AND s.removed_at IS NULL
        )
        THEN RAISE(ABORT, 'competition_linked_judge_is_entry_participant')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM competition_minecraft_links selected
            JOIN votes v
              ON v.competition_id = NEW.competition_id
             AND v.voter_subject = 'discord:' || selected.discord_user_id
            WHERE selected.minecraft_uuid = NEW.judge_uuid
        )
        THEN RAISE(ABORT, 'competition_linked_judge_has_voted')
    END;
END;

CREATE TRIGGER competition_judge_linked_identity_reactivation_guard
BEFORE UPDATE OF removed_at ON competition_judges
WHEN NEW.removed_at IS NULL AND OLD.removed_at IS NOT NULL
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM competition_minecraft_links selected
            JOIN competition_minecraft_links linked
              ON linked.discord_user_id = selected.discord_user_id
            JOIN submissions s
              ON s.competition_id = NEW.competition_id
             AND s.owner_uuid = linked.minecraft_uuid
            WHERE selected.minecraft_uuid = NEW.judge_uuid
              AND s.withdrawn_at IS NULL
              AND s.removed_at IS NULL
        )
        THEN RAISE(ABORT, 'competition_linked_judge_is_submission_owner')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM competition_minecraft_links selected
            JOIN competition_minecraft_links linked
              ON linked.discord_user_id = selected.discord_user_id
            JOIN submission_participants p
              ON p.player_uuid = linked.minecraft_uuid
            JOIN submissions s
              ON s.id = p.submission_id
             AND s.competition_id = NEW.competition_id
            WHERE selected.minecraft_uuid = NEW.judge_uuid
              AND p.invite_status = 'ACCEPTED'
              AND p.participant_role <> 'HELPER'
              AND s.withdrawn_at IS NULL
              AND s.removed_at IS NULL
        )
        THEN RAISE(ABORT, 'competition_linked_judge_is_entry_participant')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM competition_minecraft_links selected
            JOIN votes v
              ON v.competition_id = NEW.competition_id
             AND v.voter_subject = 'discord:' || selected.discord_user_id
            WHERE selected.minecraft_uuid = NEW.judge_uuid
        )
        THEN RAISE(ABORT, 'competition_linked_judge_has_voted')
    END;
END;

CREATE TRIGGER submission_owner_linked_judge_guard_insert
BEFORE INSERT ON submissions
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM competition_minecraft_links entrant
            JOIN competition_minecraft_links linked
              ON linked.discord_user_id = entrant.discord_user_id
            JOIN competition_judges j
              ON j.competition_id = NEW.competition_id
             AND j.judge_uuid = linked.minecraft_uuid
            WHERE entrant.minecraft_uuid = NEW.owner_uuid
        )
        THEN RAISE(ABORT, 'competition_linked_judge_cannot_enter')
    END;
END;

CREATE TRIGGER submission_owner_linked_judge_guard_update
BEFORE UPDATE OF competition_id, owner_uuid ON submissions
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM competition_minecraft_links entrant
            JOIN competition_minecraft_links linked
              ON linked.discord_user_id = entrant.discord_user_id
            JOIN competition_judges j
              ON j.competition_id = NEW.competition_id
             AND j.judge_uuid = linked.minecraft_uuid
            WHERE entrant.minecraft_uuid = NEW.owner_uuid
        )
        THEN RAISE(ABORT, 'competition_linked_judge_cannot_enter')
    END;
END;

CREATE TRIGGER participant_linked_judge_guard_insert
BEFORE INSERT ON submission_participants
WHEN NEW.invite_status = 'ACCEPTED' AND NEW.participant_role <> 'HELPER'
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM submissions s
            JOIN competition_minecraft_links entrant
              ON entrant.minecraft_uuid = NEW.player_uuid
            JOIN competition_minecraft_links linked
              ON linked.discord_user_id = entrant.discord_user_id
            JOIN competition_judges j
              ON j.competition_id = s.competition_id
             AND j.judge_uuid = linked.minecraft_uuid
            WHERE s.id = NEW.submission_id
        )
        THEN RAISE(ABORT, 'competition_linked_judge_cannot_enter')
    END;
END;

CREATE TRIGGER participant_linked_judge_guard_update
BEFORE UPDATE OF player_uuid, participant_role, invite_status ON submission_participants
WHEN NEW.invite_status = 'ACCEPTED' AND NEW.participant_role <> 'HELPER'
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM submissions s
            JOIN competition_minecraft_links entrant
              ON entrant.minecraft_uuid = NEW.player_uuid
            JOIN competition_minecraft_links linked
              ON linked.discord_user_id = entrant.discord_user_id
            JOIN competition_judges j
              ON j.competition_id = s.competition_id
             AND j.judge_uuid = linked.minecraft_uuid
            WHERE s.id = NEW.submission_id
        )
        THEN RAISE(ABORT, 'competition_linked_judge_cannot_enter')
    END;
END;
