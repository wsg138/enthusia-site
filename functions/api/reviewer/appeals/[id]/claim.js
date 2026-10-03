import { authenticateRequest, canReview } from "../../../../lib/auth.js";
import { forbidden, json, methodNotAllowed, serviceUnavailable, unauthorized } from "../../../../lib/responses.js";
import { boundedIdempotencyKey, requireSameOrigin } from "../../../../lib/security.js";
import { reviewerRank, signedStaffRequest, staffApiResponse } from "../../../../lib/staff-api.js";
import { isCanonicalUuid } from "../../../../lib/validation.js";

function sanitizeClaim(input) {
  const expectedVersion = Number(input?.expectedVersion);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) return null;
  const idempotencyKey = boundedIdempotencyKey(input?.idempotencyKey);
  if (!idempotencyKey) return null;
  return { expectedVersion, idempotencyKey };
}

async function authenticatedReviewer(context) {
  let session;
  try {
    session = await authenticateRequest(context.request, context.env);
  } catch {
    return { error: unauthorized() };
  }
  if (!canReview(session, context.env)) return { error: forbidden() };
  const actorRank = reviewerRank(session);
  return actorRank ? { session, actorRank } : { error: forbidden() };
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const reviewer = await authenticatedReviewer(context);
  if (reviewer.error) return reviewer.error;
  let claim;
  try {
    claim = sanitizeClaim(await context.request.json());
  } catch {
    claim = null;
  }
  const appealId = String(context.params.id ?? "").trim();
  if (!claim || !isCanonicalUuid(appealId)) return json({ error: "invalid_claim" }, 400);
  try {
    return staffApiResponse(
      await signedStaffRequest(context.env, `/v1/website/appeals/reviewer/${appealId}/claim`, {
        actorAccountId: reviewer.session.player.uuid,
        actorRank: reviewer.actorRank,
        expectedVersion: claim.expectedVersion,
        idempotencyKey: claim.idempotencyKey
      })
    );
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() { return methodNotAllowed(["POST"]); }
export { sanitizeClaim };
