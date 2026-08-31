function requireDatabase(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("Competition database binding is unavailable");
  }
  return db;
}

function requireWritableDatabase(db) {
  const database = requireDatabase(db);
  if (typeof database.batch !== "function") {
    throw new TypeError("Competition database binding is not writable");
  }
  return database;
}

const INITIAL_STATES = new Set(["PENDING", "MANUAL", "SKIPPED"]);
const TERMINAL_STATES = new Set(["DELIVERED", "FAILED", "SKIPPED"]);

function identifier(value, label) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new TypeError(`${label} is invalid`);
  }
  return normalized;
}

function detailJson(value) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Reward delivery detail must be an object");
  }
  return JSON.stringify(value);
}

function attemptNumber(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

export async function insertRewardDeliveries(db, deliveries, createdAt) {
  const database = requireWritableDatabase(db);
  if (!Array.isArray(deliveries)) throw new TypeError("Reward deliveries must be an array");
  if (!deliveries.length) return { requested: 0, inserted: 0 };
  if (typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt))) {
    throw new TypeError("Reward delivery creation time is invalid");
  }

  const operationKeys = new Set();
  const statements = deliveries.map((delivery) => {
    const id = identifier(delivery.id, "Reward delivery ID");
    const rewardId = identifier(delivery.rewardId, "Reward definition ID");
    const submissionId = identifier(delivery.submissionId, "Submission ID");
    const operationKey = identifier(delivery.operationKey, "Reward operation key");
    const recipientUuid = delivery.recipientUuid === null || delivery.recipientUuid === undefined
      ? null
      : identifier(delivery.recipientUuid, "Reward recipient UUID");
    if (!INITIAL_STATES.has(delivery.state)) throw new TypeError("Reward initial state is invalid");
    if (operationKeys.has(operationKey)) throw new TypeError("Reward operation keys must be unique within a plan");
    operationKeys.add(operationKey);

    return database.prepare(`
      INSERT OR IGNORE INTO reward_deliveries (
        id, reward_id, submission_id, recipient_uuid, operation_key,
        state, attempts, detail_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).bind(
      id,
      rewardId,
      submissionId,
      recipientUuid,
      operationKey,
      delivery.state,
      detailJson(delivery.detail),
      createdAt,
      createdAt
    );
  });

  const results = await database.batch(statements);
  const inserted = results.reduce((sum, result) => sum + Number(result?.meta?.changes ?? 0), 0);
  return { requested: deliveries.length, inserted };
}

export async function listCompetitionRewardDeliveries(db, competitionId) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    SELECT
      d.id,
      d.reward_id AS rewardId,
      d.submission_id AS submissionId,
      d.recipient_uuid AS recipientUuid,
      d.operation_key AS operationKey,
      d.state,
      d.attempts,
      d.detail_json AS detailJson,
      d.created_at AS createdAt,
      d.updated_at AS updatedAt,
      d.delivered_at AS deliveredAt,
      r.placement,
      r.reward_type AS rewardType,
      r.distribution_mode AS distributionMode,
      s.title AS submissionTitle,
      s.owner_name AS ownerName
    FROM reward_deliveries d
    JOIN reward_definitions r ON r.id = d.reward_id
    JOIN submissions s ON s.id = d.submission_id
    WHERE r.competition_id = ?
    ORDER BY r.placement ASC, d.reward_id ASC, COALESCE(d.recipient_uuid, '') ASC
  `).bind(competitionId).all();

  return (Array.isArray(result?.results) ? result.results : []).map((row) => ({
    ...row,
    attempts: Number(row.attempts),
    detail: row.detailJson ? JSON.parse(row.detailJson) : null,
    detailJson: undefined
  }));
}

export async function claimRewardDelivery(db, deliveryId, expectedAttempts, claimedAt) {
  const database = requireDatabase(db);
  const id = identifier(deliveryId, "Reward delivery ID");
  const attempts = attemptNumber(expectedAttempts, "Reward delivery attempt count");
  if (attempts === Number.MAX_SAFE_INTEGER) {
    throw new TypeError("Reward delivery attempt count is exhausted");
  }
  if (typeof claimedAt !== "string" || !Number.isFinite(Date.parse(claimedAt))) {
    throw new TypeError("Reward claim time is invalid");
  }

  const result = await database.prepare(`
    UPDATE reward_deliveries
    SET state = 'DELIVERING',
        attempts = attempts + 1,
        updated_at = ?
    WHERE id = ?
      AND state IN ('PENDING','FAILED')
      AND attempts = ?
  `).bind(claimedAt, id, attempts).run();
  return Number(result?.meta?.changes ?? 0) === 1;
}

export async function finishRewardDelivery(db, {
  deliveryId,
  expectedAttempt,
  state,
  detail = null,
  finishedAt
}) {
  const database = requireDatabase(db);
  const id = identifier(deliveryId, "Reward delivery ID");
  const attempt = attemptNumber(expectedAttempt, "Reward delivery attempt", 1);
  if (!TERMINAL_STATES.has(state)) throw new TypeError("Reward terminal state is invalid");
  if (typeof finishedAt !== "string" || !Number.isFinite(Date.parse(finishedAt))) {
    throw new TypeError("Reward completion time is invalid");
  }

  const result = await database.prepare(`
    UPDATE reward_deliveries
    SET state = ?,
        detail_json = COALESCE(?, detail_json),
        updated_at = ?,
        delivered_at = CASE WHEN ? = 'DELIVERED' THEN ? ELSE delivered_at END
    WHERE id = ?
      AND state = 'DELIVERING'
      AND attempts = ?
  `).bind(
    state,
    detailJson(detail),
    finishedAt,
    state,
    finishedAt,
    id,
    attempt
  ).run();
  return Number(result?.meta?.changes ?? 0) === 1;
}

export async function completeManualRewardDelivery(db, {
  deliveryId,
  detail = null,
  completedAt
}) {
  const database = requireDatabase(db);
  const id = identifier(deliveryId, "Reward delivery ID");
  if (typeof completedAt !== "string" || !Number.isFinite(Date.parse(completedAt))) {
    throw new TypeError("Manual reward completion time is invalid");
  }
  const result = await database.prepare(`
    UPDATE reward_deliveries
    SET state = 'DELIVERED',
        detail_json = COALESCE(?, detail_json),
        updated_at = ?,
        delivered_at = ?
    WHERE id = ?
      AND state = 'MANUAL'
  `).bind(detailJson(detail), completedAt, completedAt, id).run();
  return Number(result?.meta?.changes ?? 0) === 1;
}
