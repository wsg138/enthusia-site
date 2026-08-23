function requireDatabase(db) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("Competition database binding is unavailable");
  return db;
}

export async function enqueueCompetitionNotification(db, notification) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    INSERT INTO competition_notification_outbox (
      id, competition_id, submission_id, event_type, recipient_uuid,
      operation_key, payload_json, state, attempts, next_attempt_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?, ?)
    ON CONFLICT(operation_key) DO NOTHING
  `).bind(
    notification.id,
    notification.competitionId,
    notification.submissionId ?? null,
    notification.eventType,
    notification.recipientUuid ?? null,
    notification.operationKey,
    JSON.stringify(notification.payload ?? {}),
    notification.createdAt,
    notification.createdAt,
    notification.createdAt
  ).run();
  return Number(result?.meta?.changes ?? 0) === 1;
}

export async function listPendingCompetitionNotifications(db, now, limit = 25) {
  const database = requireDatabase(db);
  const safeLimit = Number.isInteger(limit) ? Math.min(100, Math.max(1, limit)) : 25;
  const result = await database.prepare(`
    SELECT
      id,
      competition_id AS competitionId,
      submission_id AS submissionId,
      event_type AS eventType,
      recipient_uuid AS recipientUuid,
      operation_key AS operationKey,
      payload_json AS payloadJson,
      attempts,
      next_attempt_at AS nextAttemptAt,
      created_at AS createdAt
    FROM competition_notification_outbox
    WHERE state IN ('PENDING','FAILED')
      AND next_attempt_at <= ?
    ORDER BY created_at ASC, id ASC
    LIMIT ?
  `).bind(now, safeLimit).all();
  return (Array.isArray(result?.results) ? result.results : []).map((row) => ({
    ...row,
    payload: JSON.parse(row.payloadJson),
    payloadJson: undefined
  }));
}

export async function claimCompetitionNotification(db, id, now) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    UPDATE competition_notification_outbox
    SET state = 'DELIVERING',
        attempts = attempts + 1,
        updated_at = ?
    WHERE id = ?
      AND state IN ('PENDING','FAILED')
      AND next_attempt_at <= ?
  `).bind(now, id, now).run();
  return Number(result?.meta?.changes ?? 0) === 1;
}

export async function completeCompetitionNotification(db, id, deliveredAt) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    UPDATE competition_notification_outbox
    SET state = 'DELIVERED',
        delivered_at = ?,
        updated_at = ?,
        last_error = NULL
    WHERE id = ?
      AND state = 'DELIVERING'
  `).bind(deliveredAt, deliveredAt, id).run();
  return Number(result?.meta?.changes ?? 0) === 1;
}

export async function failCompetitionNotification(db, id, { failedAt, nextAttemptAt, error }) {
  const database = requireDatabase(db);
  const message = String(error ?? "delivery_failed").slice(0, 500);
  const result = await database.prepare(`
    UPDATE competition_notification_outbox
    SET state = 'FAILED',
        next_attempt_at = ?,
        last_error = ?,
        updated_at = ?
    WHERE id = ?
      AND state = 'DELIVERING'
  `).bind(nextAttemptAt, message, failedAt, id).run();
  return Number(result?.meta?.changes ?? 0) === 1;
}

export function notificationRetryAt(now, attempts) {
  const timestamp = Date.parse(now);
  if (!Number.isFinite(timestamp)) throw new TypeError("Notification retry time is invalid");
  const count = Number.isInteger(attempts) ? Math.max(1, attempts) : 1;
  const delaySeconds = Math.min(3600, 15 * (2 ** Math.min(8, count - 1)));
  return new Date(timestamp + delaySeconds * 1000).toISOString();
}
