import { authenticateRequest, canReview } from "../../../../lib/auth.js";
import { forbidden, json, methodNotAllowed, serviceUnavailable, unauthorized } from "../../../../lib/responses.js";
import { boundedIdempotencyKey, requireSameOrigin } from "../../../../lib/security.js";
import { reviewerRank, signedStaffRequest, staffApiResponse } from "../../../../lib/staff-api.js";
import { isCanonicalUuid } from "../../../../lib/validation.js";

const MIN_NOTE_LENGTH = 3;
const MAX_NOTE_LENGTH = 1000;

function inputText(input, field) {
  return typeof input?.[field] === "string" ? input[field].trim() : "";
}

function sanitizeReopen(input) {
  const note = inputText(input, "note");
  if (note.length < MIN_NOTE_LENGTH || note.length > MAX_NOTE_LENGTH) return null;
  const expectedVersion = Number(input?.expectedVersion);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) return null;
  const idempotencyKey = boundedIdempotencyKey(input?.idempotencyKey);
  if (!idempotencyKey) return null;
  return { note, expectedVersion, idempotencyKey };
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
  let reopen;
  try {
    reopen = sanitizeReopen(await context.request.json());
  } catch {
    reopen = null;
  }
  const appealId = String(context.params.id ?? "").trim();
  if (!reopen || !isCanonicalUuid(appealId)) return json({ error: "invalid_reopen" }, 400);
  try {
    return staffApiResponse(
      await signedStaffRequest(context.env, `/v1/website/appeals/reviewer/${appealId}/reopen`, {
        actorAccountId: reviewer.session.player.uuid,
        actorRank: reviewer.actorRank,
        note: reopen.note,
        expectedVersion: reopen.expectedVersion,
        idempotencyKey: reopen.idempotencyKey
      })
    );
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() { return methodNotAllowed(["POST"]); }
export { sanitizeReopen };
