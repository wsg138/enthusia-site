
export const auditSubmissionReviewSql = `
      INSERT INTO competition_audit_events (
        id, competition_id, submission_id, actor_subject, actor_uuid,
        action, after_json, note, created_at
      )
      SELECT ?, ?, ?, ?, ?, 'SUBMISSION_SENT_FOR_REVIEW', ?, ?, ?
      WHERE changes() = 1
    `;

const countLinkedEntrySlotsTemplate1Sql = `
    WITH seed_uuids(minecraft_uuid) AS (VALUES __ENTHUSIA_SQL_PART_0__),
    discord_ids AS (
      SELECT l.discord_user_id
      FROM competition_minecraft_links l
      JOIN seed_uuids seed ON seed.minecraft_uuid = l.minecraft_uuid
      UNION
      SELECT lock.discord_user_id
      FROM competition_minecraft_identity_locks lock
      JOIN seed_uuids seed ON seed.minecraft_uuid = lock.minecraft_uuid
    ),
    identity_uuids AS (
      SELECT minecraft_uuid FROM seed_uuids
      UNION
      SELECT l.minecraft_uuid
      FROM competition_minecraft_links l
      WHERE l.discord_user_id IN (SELECT discord_user_id FROM discord_ids)
      UNION
      SELECT lock.minecraft_uuid
      FROM competition_minecraft_identity_locks lock
      WHERE lock.discord_user_id IN (SELECT discord_user_id FROM discord_ids)
    ),
    slot_rows AS (
      SELECT s.id AS submission_id
      FROM submissions s
      WHERE s.competition_id = ?
        AND s.owner_uuid IN (SELECT minecraft_uuid FROM identity_uuids)
        AND s.entry_type IN ('SOLO','GROUP')
        AND s.status NOT IN ('WITHDRAWN','REMOVED','REJECTED','DISQUALIFIED')
        AND s.removed_at IS NULL
      UNION
      SELECT p.submission_id
      FROM submission_participants p
      JOIN submissions s ON s.id = p.submission_id
      WHERE s.competition_id = ?
        AND p.player_uuid IN (SELECT minecraft_uuid FROM identity_uuids)
        AND p.invite_status = 'ACCEPTED'
        AND p.participant_role = 'MAIN'
        AND s.entry_type = 'GROUP'
        AND s.status NOT IN ('WITHDRAWN','REMOVED','REJECTED','DISQUALIFIED')
        AND s.removed_at IS NULL
    )
    SELECT COUNT(DISTINCT submission_id) AS entryCount
    FROM slot_rows
  `;
export function countLinkedEntrySlotsTemplate1(part0){return countLinkedEntrySlotsTemplate1Sql.replace("__ENTHUSIA_SQL_PART_0__",()=>part0);}
