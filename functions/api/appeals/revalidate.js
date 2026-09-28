import {
  findPunishmentBinding,
  sanitizePunishmentBinding,
  saveRevalidatedPunishmentBinding
} from "../../lib/appeal-bindings.js";
import { authenticateLinkedAppealRequest } from "../../lib/appeal-session.js";
import { revalidatePunishment, sanitizeRevalidationRequest } from "../../lib/appeal-revalidation.js";
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

async function ownedBinding(context, session, punishmentId) {
  return findPunishmentBinding(context.env?.COMPETITIONS_DB, session.discord.id, punishmentId);
}

function revalidationResponse(binding) {
  const headers = { "cache-control": "private, no-store" };
  if (binding.eligibilityState === "CODE_ROTATED") {
    return json({ error: "punishment_code_rotated", binding }, 409, headers);
  }
  return json(binding, 200, headers);
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
    const current = await ownedBinding(context, session, request.punishmentId);
    if (!current) return json({ error: "punishment_binding_not_found" }, 404);

    const upstream = await revalidatePunishment(context.env, session.accountId, current);
    if (!upstream.ok) return staffApiResponse(upstream, "private, no-store");
    const binding = sanitizePunishmentBinding(await upstream.json());
    if (!binding || binding.punishmentId !== current.punishmentId) {
      return json({ error: "invalid_punishment_binding" }, 502);
    }

    const saved = await saveRevalidatedPunishmentBinding(
      context.env?.COMPETITIONS_DB,
      session.discord.id,
      binding
    );
    return revalidationResponse(saved);
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() {
  return methodNotAllowed(["POST"]);
}
