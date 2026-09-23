import { boundedIdempotencyKey } from "./security.js";

export function sanitizeAppealComment(input) {
  const body = typeof input?.body === "string" ? input.body.trim() : "";
  const idempotencyKey = boundedIdempotencyKey(input?.idempotencyKey);
  if (body.length < 3 || body.length > 2000 || !idempotencyKey) return null;
  return { body, idempotencyKey };
}
