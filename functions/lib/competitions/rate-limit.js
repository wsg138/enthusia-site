const encoder = new TextEncoder();

function requireDatabase(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("Competition database binding is unavailable");
  }
  return db;
}

function boundedInteger(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

async function sha256Hex(value) {
  const bytes = encoder.encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function nowMilliseconds(now) {
  const value = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(value)) throw new TypeError("Rate-limit timestamp is invalid");
  return Math.floor(value);
}

export async function competitionRateLimit(db, {
  scope,
  identity,
  limit,
  windowSeconds,
  now = Date.now()
}) {
  const database = requireDatabase(db);
  const normalizedScope = String(scope ?? "").trim().toLowerCase();
  const normalizedIdentity = String(identity ?? "").trim();
  if (!/^[a-z0-9._:-]{2,64}$/.test(normalizedScope) || !normalizedIdentity || normalizedIdentity.length > 256) {
    throw new TypeError("Rate-limit identity is invalid");
  }
  const safeLimit = boundedInteger(limit, 1, 10_000, "Rate-limit request limit");
  const safeWindowSeconds = boundedInteger(windowSeconds, 1, 86_400, "Rate-limit window");
  const timestamp = nowMilliseconds(now);
  const windowMs = safeWindowSeconds * 1000;
  const windowStart = Math.floor(timestamp / windowMs) * windowMs;
  const windowEnd = windowStart + windowMs;
  const bucketKey = `${normalizedScope}:${await sha256Hex(normalizedIdentity)}`;

  // Keep the table bounded without requiring a separate maintenance job. Old
  // buckets are safe to delete because a window is never reused after expiry.
  await database.prepare("DELETE FROM competition_rate_limits WHERE expires_at <= ?")
    .bind(timestamp)
    .run();

  const row = await database.prepare(`
    INSERT INTO competition_rate_limits (
      bucket_key, window_start, request_count, expires_at
    ) VALUES (?, ?, 1, ?)
    ON CONFLICT(bucket_key, window_start) DO UPDATE SET
      request_count = competition_rate_limits.request_count + 1,
      expires_at = excluded.expires_at
    RETURNING request_count AS requestCount
  `).bind(bucketKey, windowStart, windowEnd).first();

  const requestCount = Number(row?.requestCount ?? 0);
  if (!Number.isInteger(requestCount) || requestCount < 1) {
    throw new Error("Rate-limit counter update failed");
  }
  const retryAfterSeconds = Math.max(1, Math.ceil((windowEnd - timestamp) / 1000));
  return Object.freeze({
    allowed: requestCount <= safeLimit,
    limit: safeLimit,
    requestCount,
    remaining: Math.max(0, safeLimit - requestCount),
    retryAfterSeconds,
    windowEndsAt: new Date(windowEnd).toISOString()
  });
}

export function rateLimitHeaders(result) {
  if (!result || typeof result !== "object") return {};
  return {
    "retry-after": String(result.retryAfterSeconds ?? 1),
    "x-ratelimit-limit": String(result.limit ?? 0),
    "x-ratelimit-remaining": String(result.remaining ?? 0),
    "x-ratelimit-reset": String(result.windowEndsAt ?? "")
  };
}
