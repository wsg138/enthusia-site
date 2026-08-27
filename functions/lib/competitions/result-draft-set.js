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

function identifier(value, label) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new TypeError(`${label} is invalid`);
  }
  return normalized;
}

function score(value, label, nullable = false) {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10) {
    throw new TypeError(`${label} must be between 0 and 10`);
  }
  return value;
}

function normalizeResultSet(results, configVersion) {
  if (!Array.isArray(results) || !results.length) {
    throw new TypeError("At least one provisional result is required");
  }
  const submissions = new Set();
  const placements = new Set();
  const normalized = results.map((result) => {
    const submissionId = identifier(result?.submissionId, "Submission ID");
    const placement = result?.placement;
    if (!Number.isInteger(placement) || placement < 1 || placements.has(placement)) {
      throw new TypeError("Result placements must be unique positive integers");
    }
    if (submissions.has(submissionId)) {
      throw new TypeError("A submission may only appear once in a result set");
    }
    if (!result?.snapshot || typeof result.snapshot !== "object" || Array.isArray(result.snapshot)) {
      throw new TypeError("Each provisional result requires a snapshot");
    }
    if (result.snapshot.configVersion !== configVersion) {
      throw new TypeError("Result snapshot config version does not match the result set");
    }

    submissions.add(submissionId);
    placements.add(placement);
    return {
      submissionId,
      placement,
      finalScore: score(result.finalScore, "Final score"),
      communityComponent: score(result.communityComponent, "Community component", true),
      judgeComponent: score(result.judgeComponent, "Judge component", true),
      configVersion,
      snapshot: result.snapshot
    };
  });

  return normalized.sort((left, right) => left.placement - right.placement || left.submissionId.localeCompare(right.submissionId));
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalJsonValue(value) {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!value || typeof value !== "object") return value;
  if (typeof value.toJSON === "function") return canonicalJsonValue(value.toJSON());

  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = canonicalJsonValue(value[key]);
  }
  return sorted;
}

export async function provisionalResultSetHash(results, configVersion) {
  const normalized = normalizeResultSet(results, configVersion);
  const canonical = normalized.map((result) => ({
    submissionId: result.submissionId,
    placement: result.placement,
    finalScore: result.finalScore,
    communityComponent: result.communityComponent,
    judgeComponent: result.judgeComponent,
    configVersion: result.configVersion,
    snapshot: result.snapshot
  }));
  return sha256Hex(JSON.stringify(canonicalJsonValue(canonical)));
}

export async function findResultDraftOperation(db, operationId) {
  const database = requireDatabase(db);
  const id = identifier(operationId, "Result operation ID");
  return database.prepare(`
    SELECT
      operation_id AS operationId,
      competition_id AS competitionId,
      config_version AS configVersion,
      result_set_hash AS resultSetHash,
      created_by_uuid AS createdByUuid,
      created_at AS createdAt
    FROM competition_result_draft_operations
    WHERE operation_id = ?
    LIMIT 1
  `).bind(id).first();
}

export async function replaceProvisionalResultSet(db, replacement) {
  const database = requireWritableDatabase(db);
  const competitionId = identifier(replacement.competitionId, "Competition ID");
  const operationId = identifier(replacement.operationId, "Result operation ID");
  const actorUuid = identifier(replacement.actorUuid, "Result actor UUID");
  if (!Number.isInteger(replacement.configVersion) || replacement.configVersion < 1) {
    throw new TypeError("Result config version is invalid");
  }
  if (typeof replacement.createdAt !== "string" || !Number.isFinite(Date.parse(replacement.createdAt))) {
    throw new TypeError("Result computation time is invalid");
  }

  const results = normalizeResultSet(replacement.results, replacement.configVersion);
  const hash = await provisionalResultSetHash(results, replacement.configVersion);
  const existing = await findResultDraftOperation(database, operationId);
  if (existing) {
    const same = existing.competitionId === competitionId
      && Number(existing.configVersion) === replacement.configVersion
      && existing.resultSetHash === hash;
    return same
      ? { status: "REPLAY", resultSetHash: hash, resultCount: results.length }
      : { status: "OPERATION_CONFLICT", resultSetHash: hash, resultCount: results.length };
  }

  const statements = [
    database.prepare(`
      INSERT INTO competition_result_draft_operations (
        operation_id, competition_id, config_version, result_set_hash,
        created_by_uuid, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      operationId,
      competitionId,
      replacement.configVersion,
      hash,
      actorUuid,
      replacement.createdAt
    ),
    database.prepare("DELETE FROM competition_result_drafts WHERE competition_id = ?")
      .bind(competitionId)
  ];

  for (const result of results) {
    statements.push(database.prepare(`
      INSERT INTO competition_result_drafts (
        competition_id, submission_id, placement, final_score,
        community_component, judge_component, config_version,
        snapshot_json, computed_at, computed_by_uuid
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      competitionId,
      result.submissionId,
      result.placement,
      result.finalScore,
      result.communityComponent,
      result.judgeComponent,
      replacement.configVersion,
      JSON.stringify(result.snapshot),
      replacement.createdAt,
      actorUuid
    ));
  }

  const updateIndex = statements.length;
  statements.push(database.prepare(`
    UPDATE competitions
    SET last_results_operation_id = ?, updated_at = ?
    WHERE id = ?
      AND lifecycle_state = 'RESULTS_READY'
      AND current_config_version = ?
  `).bind(
    operationId,
    replacement.createdAt,
    competitionId,
    replacement.configVersion
  ));

  statements.push(database.prepare(`
    INSERT INTO competition_audit_events (
      id, competition_id, actor_subject, actor_uuid, action,
      after_json, note, created_at
    )
    SELECT ?, c.id, ?, ?, 'COMPETITION_PROVISIONAL_RESULTS_REPLACED', ?, ?, ?
    FROM competitions c
    WHERE c.id = ?
      AND c.last_results_operation_id = ?
  `).bind(
    replacement.auditEventId,
    replacement.actorSubject,
    actorUuid,
    JSON.stringify({
      operationId,
      resultSetHash: hash,
      resultCount: results.length,
      configVersion: replacement.configVersion
    }),
    replacement.note || "Provisional result set replaced",
    replacement.createdAt,
    competitionId,
    operationId
  ));

  try {
    const batch = await database.batch(statements);
    if (Number(batch?.[updateIndex]?.meta?.changes ?? 0) !== 1) {
      return { status: "CONFLICT", resultSetHash: hash, resultCount: results.length };
    }
    return { status: "UPDATED", resultSetHash: hash, resultCount: results.length };
  } catch (error) {
    const message = String(error?.message ?? error);
    if (message.includes("UNIQUE constraint") || message.includes("operation_replay")) {
      const replay = await findResultDraftOperation(database, operationId).catch(() => null);
      const same = replay
        && replay.competitionId === competitionId
        && Number(replay.configVersion) === replacement.configVersion
        && replay.resultSetHash === hash;
      return same
        ? { status: "REPLAY", resultSetHash: hash, resultCount: results.length }
        : { status: "OPERATION_CONFLICT", resultSetHash: hash, resultCount: results.length };
    }
    throw error;
  }
}
