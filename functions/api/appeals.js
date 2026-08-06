import { authenticateRequest } from "../lib/auth.js";
import { json, methodNotAllowed, serviceUnavailable, unauthorized } from "../lib/responses.js";
import { appealIdempotencyKey, enforceRateLimit, requireSameOrigin } from "../lib/security.js";
import { signedStaffRequest, staffApiResponse } from "../lib/staff-api.js";

const MIN_REASON_LENGTH = 10;
const MAX_REASON_LENGTH = 1000;

function sanitizeSubmission(input) {
  const punishmentId = typeof input?.punishmentId === "string" ? input.punishmentId.trim() : "";
  const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
  if (!/^[0-9a-fA-F-]{36}$/.test(punishmentId)) return null;
  if (reason.length < MIN_REASON_LENGTH || reason.length > MAX_REASON_LENGTH) return null;
  return { punishmentId, reason };
}

function buildAppealPayload(submission, session) {
  return {
    punishmentId: submission.punishmentId,
    reason: submission.reason,
    accountId: session.subject,
    username: session.player.name,
  };
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  let session;
  try { session = await authenticateRequest(context.request, context.env); } catch { return unauthorized(); }

  let submission;
  try { submission = sanitizeSubmission(await context.request.json()); } catch { submission = null; }
  if (!submission) return json({ error: "invalid_appeal" }, 400);

  const rate = await enforceRateLimit(
    context.env.APPEAL_RATE_LIMIT,
    session.subject,
    Number(context.env.APPEAL_RATE_LIMIT_MAX ?? 3),
  );
  if (!rate.allowed) {
    return json(
      { error: "rate_limited", retryAfter: rate.retryAfter },
      429,
      { "retry-after": String(rate.retryAfter) },
    );
  }

  try {
    const payload = buildAppealPayload(submission, session);
    payload.idempotencyKey = await appealIdempotencyKey(session, submission);
    return staffApiResponse(
      await signedStaffRequest(context.env, "/v1/website/appeals/submit", payload),
      "private, no-store",
    );
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() { return methodNotAllowed(["POST"]); }
export { buildAppealPayload, sanitizeSubmission };
