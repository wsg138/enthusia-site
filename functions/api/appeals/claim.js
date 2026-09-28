import { authenticateAppealRequest } from "../../lib/appeal-session.js";
import { claimPunishment, sanitizeClaim } from "../../lib/appeal-claim.js";
import { competitionRateLimit, rateLimitHeaders } from "../../lib/competitions/rate-limit.js";
import { json, methodNotAllowed, serviceUnavailable, unauthorized } from "../../lib/responses.js";
import { requireSameOrigin } from "../../lib/security.js";
import { staffApiResponse } from "../../lib/staff-api.js";
import { verifyTurnstile } from "../../lib/turnstile.js";

async function claimRateLimit(context, session) {
  const result = await competitionRateLimit(context.env?.COMPETITIONS_DB, {
    scope: "appeal.claim",
    identity: session.subject,
    limit: 8,
    windowSeconds: 900
  });
  return result.allowed
    ? null
    : json({ error: "rate_limited", retryAfterSeconds: result.retryAfterSeconds }, 429, rateLimitHeaders(result));
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  let session;
  try { session = await authenticateAppealRequest(context.request, context.env); } catch { return unauthorized(); }

  let limited;
  try { limited = await claimRateLimit(context, session); } catch { return serviceUnavailable(); }
  if (limited) return limited;

  let payload;
  try { payload = await context.request.json(); } catch { payload = null; }
  const claim = sanitizeClaim(payload);
  if (!claim) return json({ error: "invalid_punishment_claim" }, 400);

  let humanVerified;
  try { humanVerified = await verifyTurnstile(context.env, payload?.turnstileToken, { action: "appeal_claim" }); }
  catch { return serviceUnavailable(); }
  if (!humanVerified) return json({ error: "turnstile_required" }, 403);

  try {
    return staffApiResponse(await claimPunishment(context.env, session, claim), "private, no-store");
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() {
  return methodNotAllowed(["POST"]);
}

export { claimRateLimit };
