import { authenticateRequest, canReview } from "../../../lib/auth.js";
import { forbidden, json, methodNotAllowed, serviceUnavailable, unauthorized } from "../../../lib/responses.js";
import { boundedIdempotencyKey, requireSameOrigin } from "../../../lib/security.js";
import { reviewerRank, signedStaffRequest, staffApiResponse } from "../../../lib/staff-api.js";
import { isCanonicalUuid } from "../../../lib/validation.js";

const DECISIONS = new Set(["approve", "deny", "request_information"]);

function inputText(input, field) {
  return typeof input?.[field] === "string" ? input[field].trim() : "";
}

function sanitizeDecision(input) {
  const decision = inputText(input, "decision").toLowerCase();
  if (!DECISIONS.has(decision)) return null;
  const expectedVersion = Number(input?.expectedVersion);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) return null;
  const note = inputText(input, "note");
  if (note.length < 3 || note.length > 1000) return null;
  const idempotencyKey = boundedIdempotencyKey(input?.idempotencyKey);
  if (!idempotencyKey) return null;
  return { decision, expectedVersion, note, idempotencyKey };
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

async function requestDecision(context, appealId, reviewer, decision) {
  const upstream = await signedStaffRequest(
    context.env,
    `/v1/website/appeals/reviewer/${appealId}/decision`,
    {
      actorAccountId: reviewer.session.player.uuid,
      actorRank: reviewer.actorRank,
      decision: decision.decision,
      expectedVersion: decision.expectedVersion,
      note: decision.note,
      idempotencyKey: decision.idempotencyKey
    }
  );
  return staffApiResponse(upstream);
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const reviewer = await authenticatedReviewer(context);
  if (reviewer.error) return reviewer.error;
  let decision;
  try {
    decision = sanitizeDecision(await context.request.json());
  } catch {
    decision = null;
  }
  const appealId = String(context.params.id ?? "").trim();
  if (!decision || !isCanonicalUuid(appealId)) return json({ error: "invalid_decision" }, 400);
  try {
    return await requestDecision(context, appealId, reviewer, decision);
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() { return methodNotAllowed(["POST"]); }
export { sanitizeDecision };
