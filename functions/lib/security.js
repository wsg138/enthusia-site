export function requireSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === new URL(request.url).origin;
}

export async function enforceRateLimit(namespace, key, limit = 3, windowSeconds = 3600, now = Date.now()) {
  if (!namespace?.get || !namespace?.put) return { allowed: false, retryAfter: windowSeconds };
  const bucket = Math.floor(now / (windowSeconds * 1000));
  const storageKey = `appeal-rate:${key}:${bucket}`;
  const current = Number(await namespace.get(storageKey)) || 0;
  if (current >= limit) {
    const retryAfter = Math.max(1, Math.ceil(((bucket + 1) * windowSeconds * 1000 - now) / 1000));
    return { allowed: false, retryAfter };
  }
  await namespace.put(storageKey, String(current + 1), { expirationTtl: windowSeconds + 60 });
  return { allowed: true, retryAfter: 0 };
}

function bytesToHex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function appealIdempotencyKey(session, submission) {
  const material = `${session.subject}\n${session.player.uuid}\n${submission.punishmentId}\n${submission.reason}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return `appeal-${bytesToHex(new Uint8Array(digest))}`;
}

export function boundedIdempotencyKey(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{8,128}$/.test(value) ? value : null;
}
