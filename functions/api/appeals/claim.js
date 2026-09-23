import { authenticateAppealRequest } from "../../lib/appeal-session.js";
import { claimPunishment, sanitizeClaim } from "../../lib/appeal-claim.js";
import { json, methodNotAllowed, serviceUnavailable, unauthorized } from "../../lib/responses.js";
import { requireSameOrigin } from "../../lib/security.js";
import { staffApiResponse } from "../../lib/staff-api.js";

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  let session;
  try { session = await authenticateAppealRequest(context.request, context.env); } catch { return unauthorized(); }
  let claim;
  try { claim = sanitizeClaim(await context.request.json()); } catch { claim = null; }
  if (!claim) return json({ error: "invalid_punishment_claim" }, 400);
  try {
    return staffApiResponse(await claimPunishment(context.env, session, claim), "private, no-store");
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() {
  return methodNotAllowed(["POST"]);
}
