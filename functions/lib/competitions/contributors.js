function requireDatabase(db) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("Competition database binding is unavailable");
  return db;
}

function requireWritableDatabase(db) {
  const database = requireDatabase(db);
  if (typeof database.batch !== "function") throw new TypeError("Competition database binding is not writable");
  return database;
}

export async function inviteSubmissionContributor(db, invite) {
  const database = requireWritableDatabase(db);
  const results = await database.batch([
    database.prepare(`
      INSERT INTO submission_participants (
        submission_id, player_uuid, player_name, participant_role,
        invite_status, invited_by_uuid, invited_at, responded_at
      ) VALUES (?, ?, ?, ?, 'PENDING', ?, ?, NULL)
      ON CONFLICT(submission_id, player_uuid) DO UPDATE SET
        player_name = excluded.player_name,
        participant_role = excluded.participant_role,
        invite_status = 'PENDING',
        invited_by_uuid = excluded.invited_by_uuid,
        invited_at = excluded.invited_at,
        responded_at = NULL
      WHERE submission_participants.invite_status = 'DECLINED'
    `).bind(
      invite.submissionId,
      invite.playerUuid,
      invite.playerName,
      invite.role,
      invite.invitedByUuid,
      invite.invitedAt
    ),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, submission_id, actor_subject, actor_uuid,
        action, after_json, note, created_at
      )
      SELECT ?, ?, ?, ?, ?, 'SUBMISSION_CONTRIBUTOR_INVITED', ?, ?, ?
      WHERE changes() = 1
    `).bind(
      invite.auditEventId,
      invite.competitionId,
      invite.submissionId,
      invite.actorSubject,
      invite.invitedByUuid,
      JSON.stringify({ playerUuid: invite.playerUuid, playerName: invite.playerName, role: invite.role }),
      `Invited ${invite.playerName} as ${invite.role}`,
      invite.invitedAt
    )
  ]);
  return Number(results?.[0]?.meta?.changes ?? 0) === 1;
}

export async function removeSubmissionContributor(db, removal) {
  const database = requireWritableDatabase(db);
  const results = await database.batch([
    database.prepare(`
      DELETE FROM submission_participants
      WHERE submission_id = ?
        AND player_uuid = ?
        AND participant_role <> 'OWNER'
    `).bind(removal.submissionId, removal.playerUuid),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, submission_id, actor_subject, actor_uuid,
        action, after_json, note, created_at
      )
      SELECT ?, ?, ?, ?, ?, 'SUBMISSION_CONTRIBUTOR_REMOVED', ?, ?, ?
      WHERE changes() = 1
    `).bind(
      removal.auditEventId,
      removal.competitionId,
      removal.submissionId,
      removal.actorSubject,
      removal.removedByUuid,
      JSON.stringify({ playerUuid: removal.playerUuid }),
      "Contributor removed",
      removal.removedAt
    )
  ]);
  return Number(results?.[0]?.meta?.changes ?? 0) === 1;
}

export async function listPendingInvitesForPlayer(db, playerUuid) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    SELECT
      p.submission_id AS submissionId,
      p.player_uuid AS playerUuid,
      p.player_name AS playerName,
      p.participant_role AS role,
      p.invited_at AS invitedAt,
      s.competition_id AS competitionId,
      s.title AS submissionTitle,
      s.status AS submissionStatus,
      c.title AS competitionTitle,
      c.slug AS competitionSlug,
      c.lifecycle_state AS lifecycleState
    FROM submission_participants p
    JOIN submissions s ON s.id = p.submission_id
    JOIN competitions c ON c.id = s.competition_id
    WHERE p.player_uuid = ?
      AND p.invite_status = 'PENDING'
      AND c.lifecycle_state <> 'CANCELLED'
      AND s.status NOT IN ('WITHDRAWN','REMOVED','REJECTED','DISQUALIFIED')
      AND s.removed_at IS NULL
    ORDER BY p.invited_at ASC, p.submission_id ASC
  `).bind(playerUuid).all();
  return Array.isArray(result?.results) ? result.results : [];
}

export async function getPendingSubmissionInvite(db, competitionId, submissionId, playerUuid) {
  const database = requireDatabase(db);
  return database.prepare(`
    SELECT
      p.submission_id AS submissionId,
      p.player_uuid AS playerUuid,
      p.player_name AS playerName,
      p.participant_role AS role,
      p.invited_at AS invitedAt,
      s.competition_id AS competitionId,
      s.title AS submissionTitle,
      s.status AS submissionStatus,
      c.lifecycle_state AS lifecycleState
    FROM submission_participants p
    JOIN submissions s ON s.id = p.submission_id
    JOIN competitions c ON c.id = s.competition_id
    WHERE s.competition_id = ?
      AND p.submission_id = ?
      AND p.player_uuid = ?
      AND p.invite_status = 'PENDING'
      AND s.removed_at IS NULL
    LIMIT 1
  `).bind(competitionId, submissionId, playerUuid).first();
}

export async function respondSubmissionInvite(db, response) {
  const database = requireWritableDatabase(db);
  const status = response.accept ? "ACCEPTED" : "DECLINED";
  const results = await database.batch([
    database.prepare(`
      UPDATE submission_participants
      SET invite_status = ?, responded_at = ?
      WHERE submission_id = ?
        AND player_uuid = ?
        AND invite_status = 'PENDING'
    `).bind(status, response.respondedAt, response.submissionId, response.playerUuid),
    database.prepare(`
      INSERT INTO competition_audit_events (
        id, competition_id, submission_id, actor_subject, actor_uuid,
        action, after_json, note, created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE changes() = 1
    `).bind(
      response.auditEventId,
      response.competitionId,
      response.submissionId,
      response.actorSubject,
      response.playerUuid,
      response.accept ? "SUBMISSION_CONTRIBUTOR_ACCEPTED" : "SUBMISSION_CONTRIBUTOR_DECLINED",
      JSON.stringify({ playerUuid: response.playerUuid, inviteStatus: status }),
      response.accept ? "Contributor invite accepted" : "Contributor invite declined",
      response.respondedAt
    )
  ]);
  return Number(results?.[0]?.meta?.changes ?? 0) === 1;
}
