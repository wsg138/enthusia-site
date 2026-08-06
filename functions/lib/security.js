export function requireSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === new URL(request.url).origin;
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
