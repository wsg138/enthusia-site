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

function replacementIdentity(replacement) {
  const competitionId = identifier(replacement.competitionId, "Competition ID");
  const operationId = identifier(replacement.operationId, "Result operation ID");
  const actorUuid = identifier(replacement.actorUuid, "Result actor UUID");
  if (!Number.isInteger(replacement.configVersion) || replacement.configVersion < 1) {
    throw new TypeError("Result config version is invalid");
  }
  if (typeof replacement.createdAt !== "string" || !Number.isFinite(Date.parse(replacement.createdAt))) {
    throw new TypeError("Result computation time is invalid");
  }
  return {
    competitionId,
    operationId,
    actorUuid,
    configVersion: replacement.configVersion,
    createdAt: replacement.createdAt
  };
}

function resultSetResponse(status, hash, resultCount) {
  return { status, resultSetHash: hash, resultCount };
}

function existingOperationResponse(existing, identity, hash, resultCount) {
  if (!existing) return null;
  const sameCompetition = existing.competitionId === identity.competitionId;
  const sameVersion = Number(existing.configVersion) === identity.configVersion;
  const sameHash = existing.resultSetHash === hash;
  return resultSetResponse(
    sameCompetition && sameVersion && sameHash ? "REPLAY" : "OPERATION_CONFLICT",
    hash,
    resultCount
  );
}

function operationStatement(database, identity, hash) {
  return database.prepare(`
    INSERT INTO competition_result_draft_operations (
      operation_id, competition_id, config_version, result_set_hash,
      created_by_uuid, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    identity.operationId,
    identity.competitionId,
    identity.configVersion,
    hash,
    identity.actorUuid,
    identity.createdAt
  );
}

function resultStatement(database, identity, result) {
  return database.prepare(`
    INSERT INTO competition_result_drafts (
      competition_id, submission_id, placement, final_score,
      community_component, judge_component, config_version,
      snapshot_json, computed_at, computed_by_uuid
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    identity.competitionId,
    result.submissionId,
    result.placement,
    result.finalScore,
    result.communityComponent,
    result.judgeComponent,
    identity.configVersion,
    JSON.stringify(result.snapshot),
    identity.createdAt,
    identity.actorUuid
  );
}

function finalizationStatement(database, identity) {
  return database.prepare(`
    UPDATE competitions
    SET last_results_operation_id = ?, updated_at = ?
    WHERE id = ?
      AND lifecycle_state = 'RESULTS_READY'
      AND current_config_version = ?
  `).bind(
    identity.operationId,
    identity.createdAt,
    identity.competitionId,
    identity.configVersion
  );
}

function auditStatement(database, replacement, identity, hash, resultCount) {
  return database.prepare(`
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
    identity.actorUuid,
    JSON.stringify({
      operationId: identity.operationId,
      resultSetHash: hash,
      resultCount,
      configVersion: identity.configVersion
    }),
    replacement.note || "Provisional result set replaced",
    identity.createdAt,
    identity.competitionId,
    identity.operationId
  );
}

function replacementStatements(database, replacement, identity, results, hash) {
  const statements = [
    operationStatement(database, identity, hash),
    database.prepare("DELETE FROM competition_result_drafts WHERE competition_id = ?")
      .bind(identity.competitionId)
  ];
  for (const result of results) statements.push(resultStatement(database, identity, result));
  const updateIndex = statements.length;
  statements.push(finalizationStatement(database, identity));
  statements.push(auditStatement(database, replacement, identity, hash, results.length));
  return { statements, updateIndex };
}

function replayConflictError(error) {
  const message = String(error?.message ?? error);
  return message.includes("UNIQUE constraint") || message.includes("operation_replay");
}

async function replayAfterConflict(database, identity, hash, resultCount) {
  const replay = await findResultDraftOperation(database, identity.operationId).catch(() => null);
  return existingOperationResponse(replay, identity, hash, resultCount)
    ?? resultSetResponse("OPERATION_CONFLICT", hash, resultCount);
}

export async function replaceProvisionalResultSet(db, replacement) {
  const database = requireWritableDatabase(db);
  const identity = replacementIdentity(replacement);
  const results = normalizeResultSet(replacement.results, identity.configVersion);
  const hash = await provisionalResultSetHash(results, identity.configVersion);
  const existing = await findResultDraftOperation(database, identity.operationId);
  const existingResponse = existingOperationResponse(existing, identity, hash, results.length);
  if (existingResponse) return existingResponse;

  const { statements, updateIndex } = replacementStatements(
    database,
    replacement,
    identity,
    results,
    hash
  );

  try {
    const batch = await database.batch(statements);
    if (Number(batch?.[updateIndex]?.meta?.changes ?? 0) !== 1) {
      return resultSetResponse("CONFLICT", hash, results.length);
    }
    return resultSetResponse("UPDATED", hash, results.length);
  } catch (error) {
    if (replayConflictError(error)) {
      return replayAfterConflict(database, identity, hash, results.length);
    }
    throw error;
  }
}
