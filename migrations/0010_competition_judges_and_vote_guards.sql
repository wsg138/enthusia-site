PRAGMA foreign_keys = ON;

-- competition_judges is part of the baseline competition schema. This
-- migration extends it with removal audit metadata and enforces the fairness
-- rules around judging, entry participation, and public voting.
ALTER TABLE competition_judges ADD COLUMN removed_by_uuid TEXT;

-- A judge may be credited only as a HELPER. Owners/main entrants/guild workers
-- can never be turned into judges for the same competition.
CREATE TRIGGER competition_judge_assignment_entry_guard
BEFORE INSERT ON competition_judges
WHEN NEW.removed_at IS NULL
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM submissions s
            WHERE s.competition_id = NEW.competition_id
              AND s.owner_uuid = NEW.judge_uuid
              AND s.withdrawn_at IS NULL
              AND s.removed_at IS NULL
        )
        THEN RAISE(ABORT, 'competition_judge_is_submission_owner')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM submission_participants p
            JOIN submissions s ON s.id = p.submission_id
            WHERE s.competition_id = NEW.competition_id
              AND p.player_uuid = NEW.judge_uuid
              AND p.invite_status = 'ACCEPTED'
              AND p.participant_role <> 'HELPER'
              AND s.withdrawn_at IS NULL
              AND s.removed_at IS NULL
        )
        THEN RAISE(ABORT, 'competition_judge_is_entry_participant')
    END;
END;

CREATE TRIGGER competition_judge_reactivation_entry_guard
BEFORE UPDATE OF removed_at ON competition_judges
WHEN NEW.removed_at IS NULL AND OLD.removed_at IS NOT NULL
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM submissions s
            WHERE s.competition_id = NEW.competition_id
              AND s.owner_uuid = NEW.judge_uuid
              AND s.withdrawn_at IS NULL
              AND s.removed_at IS NULL
        )
        THEN RAISE(ABORT, 'competition_judge_is_submission_owner')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM submission_participants p
            JOIN submissions s ON s.id = p.submission_id
            WHERE s.competition_id = NEW.competition_id
              AND p.player_uuid = NEW.judge_uuid
              AND p.invite_status = 'ACCEPTED'
              AND p.participant_role <> 'HELPER'
              AND s.withdrawn_at IS NULL
              AND s.removed_at IS NULL
        )
        THEN RAISE(ABORT, 'competition_judge_is_entry_participant')
    END;
END;

-- Someone who has ever been selected as a judge for this competition cannot
-- later become an owner/main entrant after seeing judge-only material.
CREATE TRIGGER submission_owner_judge_guard_insert
BEFORE INSERT ON submissions
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1 FROM competition_judges j
            WHERE j.competition_id = NEW.competition_id
              AND j.judge_uuid = NEW.owner_uuid
        )
        THEN RAISE(ABORT, 'competition_judge_cannot_enter')
    END;
END;

CREATE TRIGGER submission_owner_judge_guard_update
BEFORE UPDATE OF competition_id, owner_uuid ON submissions
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1 FROM competition_judges j
            WHERE j.competition_id = NEW.competition_id
              AND j.judge_uuid = NEW.owner_uuid
        )
        THEN RAISE(ABORT, 'competition_judge_cannot_enter')
    END;
END;

CREATE TRIGGER participant_judge_guard_insert
BEFORE INSERT ON submission_participants
WHEN NEW.invite_status = 'ACCEPTED' AND NEW.participant_role <> 'HELPER'
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM submissions s
            JOIN competition_judges j ON j.competition_id = s.competition_id
            WHERE s.id = NEW.submission_id
              AND j.judge_uuid = NEW.player_uuid
        )
        THEN RAISE(ABORT, 'competition_judge_cannot_enter')
    END;
END;

CREATE TRIGGER participant_judge_guard_update
BEFORE UPDATE OF player_uuid, participant_role, invite_status ON submission_participants
WHEN NEW.invite_status = 'ACCEPTED' AND NEW.participant_role <> 'HELPER'
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM submissions s
            JOIN competition_judges j ON j.competition_id = s.competition_id
            WHERE s.id = NEW.submission_id
              AND j.judge_uuid = NEW.player_uuid
        )
        THEN RAISE(ABORT, 'competition_judge_cannot_enter')
    END;
END;

CREATE TRIGGER judge_score_assignment_guard_insert
BEFORE INSERT ON judge_scores
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1
            FROM competition_judges j
            JOIN competitions c ON c.id = j.competition_id
            JOIN submissions s
              ON s.id = NEW.submission_id
             AND s.competition_id = NEW.competition_id
            WHERE j.competition_id = NEW.competition_id
              AND j.judge_uuid = NEW.judge_uuid
              AND j.removed_at IS NULL
              AND c.lifecycle_state = 'JUDGING'
              AND c.current_config_version = NEW.config_version
              AND s.status = 'APPROVED'
              AND s.removed_at IS NULL
        )
        THEN RAISE(ABORT, 'competition_judge_score_not_allowed')
    END;
END;

CREATE TRIGGER judge_score_assignment_guard_update
BEFORE UPDATE ON judge_scores
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1
            FROM competition_judges j
            JOIN competitions c ON c.id = j.competition_id
            JOIN submissions s
              ON s.id = NEW.submission_id
             AND s.competition_id = NEW.competition_id
            WHERE j.competition_id = NEW.competition_id
              AND j.judge_uuid = NEW.judge_uuid
              AND j.removed_at IS NULL
              AND c.lifecycle_state = 'JUDGING'
              AND c.current_config_version = NEW.config_version
              AND s.status = 'APPROVED'
              AND s.removed_at IS NULL
        )
        THEN RAISE(ABORT, 'competition_judge_score_not_allowed')
    END;
END;

-- Public voting uses voter_subject so all linked Minecraft accounts under the
-- same account identity share the same configurable ballot limit.
CREATE TRIGGER competition_vote_fairness_guard
BEFORE INSERT ON votes
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1
            FROM competitions c
            JOIN submissions s
              ON s.competition_id = c.id
             AND s.id = NEW.submission_id
            WHERE c.id = NEW.competition_id
              AND c.lifecycle_state = 'VOTING'
              AND s.status = 'APPROVED'
              AND s.removed_at IS NULL
        )
        THEN RAISE(ABORT, 'competition_vote_not_open_or_entry_ineligible')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1 FROM competition_judges j
            WHERE j.competition_id = NEW.competition_id
              AND j.judge_uuid = NEW.voter_uuid
        )
        THEN RAISE(ABORT, 'competition_judge_cannot_vote')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM submissions s
            WHERE s.id = NEW.submission_id
              AND s.owner_uuid = NEW.voter_uuid
        )
        THEN RAISE(ABORT, 'competition_owner_cannot_vote_own_entry')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM submission_participants p
            WHERE p.submission_id = NEW.submission_id
              AND p.player_uuid = NEW.voter_uuid
              AND p.invite_status = 'ACCEPTED'
              AND p.participant_role IN ('OWNER','MAIN','GUILD_WORKER')
        )
        THEN RAISE(ABORT, 'competition_participant_cannot_vote_own_entry')
    END;

    SELECT CASE
        WHEN (
            SELECT COUNT(*)
            FROM votes v
            WHERE v.competition_id = NEW.competition_id
              AND v.voter_subject = NEW.voter_subject
        ) >= COALESCE((
            SELECT CAST(json_extract(cv.config_json, '$.voting.votesPerVoter') AS INTEGER)
            FROM competitions c
            JOIN competition_config_versions cv
              ON cv.competition_id = c.id
             AND cv.version = c.current_config_version
            WHERE c.id = NEW.competition_id
        ), 0)
        THEN RAISE(ABORT, 'competition_vote_limit_reached')
    END;
END;
