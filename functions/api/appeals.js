import { authenticateAppealRequest } from "../lib/appeal-session.js";
import { claimPunishment, sanitizeClaim } from "../lib/appeal-claim.js";
import { json, methodNotAllowed, serviceUnavailable, unauthorized } from "../lib/responses.js";
import { appealIdempotencyKey, requireSameOrigin } from "../lib/security.js";
import { signedStaffRequest, staffApiResponse } from "../lib/staff-api.js";
import { isCanonicalUuid } from "../lib/validation.js";

const MIN_REASON_LENGTH = 10;
const MAX_REASON_LENGTH = 1000;

function sanitizeSubmission(input) {
  const claim = sanitizeClaim(input);
  const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
  if (!claim) return null;
  if (reason.length < MIN_REASON_LENGTH || reason.length > MAX_REASON_LENGTH) return null;
  return { ...claim, reason };
}

function verifiedBinding(input, claim) {
  const punishmentId = typeof input?.punishmentId === "string" ? input.punishmentId.trim() : "";
  const username = typeof input?.boundUsername === "string" ? input.boundUsername.trim() : "";
  if (!isCanonicalUuid(punishmentId) || username.toLowerCase() !== claim.username.toLowerCase()) return null;
  return { punishmentId, username };
}

function buildAppealPayload(submission, session, binding) {
  return {
    punishmentId: binding.punishmentId,
    reason: submission.reason,
    accountId: session.accountId,
    username: binding.username
  };
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  let session;
  try { session = await authenticateAppealRequest(context.request, context.env); } catch { return unauthorized(); }

  let submission;
  try { submission = sanitizeSubmission(await context.request.json()); } catch { submission = null; }
  if (!submission) return json({ error: "invalid_appeal" }, 400);

  try {
    const claimResponse = await claimPunishment(context.env, session, submission);
    if (!claimResponse.ok) return staffApiResponse(claimResponse, "private, no-store");
    const binding = verifiedBinding(await claimResponse.json(), submission);
    if (!binding) return serviceUnavailable();
    const payload = buildAppealPayload(submission, session, binding);
    payload.idempotencyKey = await appealIdempotencyKey(session, {
      punishmentId: binding.punishmentId,
      reason: submission.reason
    });
    return staffApiResponse(
      await signedStaffRequest(context.env, "/v1/website/appeals/submit", payload),
      "private, no-store"
    );
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() { return methodNotAllowed(["POST"]); }
export { buildAppealPayload, sanitizeSubmission, verifiedBinding };
