import { sanitizeRevalidationRequest } from "../../lib/appeal-revalidation.js";
import { revalidateOwnedPunishmentBinding } from "../../lib/appeal-revalidation-service.js";
import { authenticateLinkedAppealRequest } from "../../lib/appeal-session.js";
import { competitionRateLimit, rateLimitHeaders } from "../../lib/competitions/rate-limit.js";
import { json, methodNotAllowed, serviceUnavailable, unauthorized } from "../../lib/responses.js";
import { requireSameOrigin } from "../../lib/security.js";
import { staffApiResponse } from "../../lib/staff-api.js";

export async function revalidationRateLimit(context, session) {
  const result = await competitionRateLimit(context.env?.COMPETITIONS_DB, {
    scope: "appeal.revalidate",
    identity: session.subject,
    limit: 12,
    windowSeconds: 900
  });
  return result.allowed
    ? null
    : json({ error: "rate_limited", retryAfterSeconds: result.retryAfterSeconds }, 429, rateLimitHeaders(result));
}

function revalidationResponse(binding) {
  const headers = { "cache-control": "private, no-store" };
  if (binding.eligibilityState === "CODE_ROTATED") {
    return json({ error: "punishment_code_rotated", binding }, 409, headers);
  }
  return json(binding, 200, headers);
}

function resultResponse(result) {
  if (result.kind === "NOT_FOUND") return json({ error: "punishment_binding_not_found" }, 404);
  if (result.kind === "UPSTREAM_REJECTED") return staffApiResponse(result.upstream, "private, no-store");
  if (result.kind === "INVALID_UPSTREAM") return json({ error: "invalid_punishment_binding" }, 502);
  return revalidationResponse(result.binding);
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  let session;
  try { session = await authenticateLinkedAppealRequest(context.request, context.env); }
  catch { return serviceUnavailable(); }
  if (!session) return unauthorized();

  let limited;
  try { limited = await revalidationRateLimit(context, session); } catch { return serviceUnavailable(); }
  if (limited) return limited;

  let payload;
  try { payload = await context.request.json(); } catch { payload = null; }
  const request = sanitizeRevalidationRequest(payload);
  if (!request) return json({ error: "invalid_revalidation_request" }, 400);

  try {
    const result = await revalidateOwnedPunishmentBinding({
      db: context.env?.COMPETITIONS_DB,
      env: context.env,
      ownerDiscordId: session.discord.id,
      accountId: session.accountId,
      punishmentId: request.punishmentId
    });
    return resultResponse(result);
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() {
  return methodNotAllowed(["POST"]);
}
