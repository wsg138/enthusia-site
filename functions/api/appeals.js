import { authenticateRequest } from "../lib/auth.js";
import { json, methodNotAllowed, serviceUnavailable, unauthorized } from "../lib/responses.js";
import { appealIdempotencyKey, enforceRateLimit, requireSameOrigin } from "../lib/security.js";

const MAX_REASON_LENGTH = 4000;

function sanitizeSubmission(input) {
  const punishmentId = typeof input?.punishmentId === "string" ? input.punishmentId.trim() : "";
  const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
  if (!punishmentId || punishmentId.length > 128) return null;
  if (!reason || reason.length > MAX_REASON_LENGTH) return null;
  return { punishmentId, reason };
}

function buildAppealPayload(submission, session) {
  return {
    punishmentId: submission.punishmentId,
    reason: submission.reason,
    appellant: { uuid: session.player.uuid, name: session.player.name, subject: session.subject },
  };
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  let session;
  try { session = await authenticateRequest(context.request, context.env); } catch { return unauthorized(); }

  let submission;
  try { submission = sanitizeSubmission(await context.request.json()); } catch { submission = null; }
  if (!submission) return json({ error: "invalid_appeal" }, 400);
  if (!context.env.APPEALS_API?.fetch) return serviceUnavailable();

  const rate = await enforceRateLimit(context.env.APPEAL_RATE_LIMIT, session.subject, Number(context.env.APPEAL_RATE_LIMIT_MAX ?? 3));
  if (!rate.allowed) return json({ error: "rate_limited", retryAfter: rate.retryAfter }, 429, { "retry-after": String(rate.retryAfter) });

  const idempotencyKey = await appealIdempotencyKey(session, submission);
  const upstream = await context.env.APPEALS_API.fetch("https://staff.internal/appeals", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(buildAppealPayload(submission, session)),
  });
  return new Response(upstream.body, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" } });
}

export function onRequest() { return methodNotAllowed(["POST"]); }
export { buildAppealPayload, sanitizeSubmission };
