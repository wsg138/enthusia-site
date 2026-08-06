import { authenticateRequest, canReview } from "../../../lib/auth.js";
import { forbidden, json, methodNotAllowed, serviceUnavailable, unauthorized } from "../../../lib/responses.js";
import { boundedIdempotencyKey, requireSameOrigin } from "../../../lib/security.js";
import { reviewerRank, signedStaffRequest, staffApiResponse } from "../../../lib/staff-api.js";

const DECISIONS = new Set(["approve", "deny", "request_information"]);

function sanitizeDecision(input) {
  const decision = typeof input?.decision === "string" ? input.decision.trim().toLowerCase() : "";
  const expectedVersion = Number(input?.expectedVersion);
  const note = typeof input?.note === "string" ? input.note.trim() : "";
  const idempotencyKey = boundedIdempotencyKey(input?.idempotencyKey);
  if (!DECISIONS.has(decision) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) return null;
  if (note.length < 3 || note.length > 1000 || !idempotencyKey) return null;
  return { decision, expectedVersion, note, idempotencyKey };
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  let session;
  try { session = await authenticateRequest(context.request, context.env); } catch { return unauthorized(); }
  if (!canReview(session, context.env)) return forbidden();
  const actorRank = reviewerRank(session);
  if (!actorRank) return forbidden();

  let decision;
  try { decision = sanitizeDecision(await context.request.json()); } catch { decision = null; }
  const appealId = String(context.params.id ?? "").trim();
  if (!decision || !/^[0-9a-fA-F-]{36}$/.test(appealId)) return json({ error: "invalid_decision" }, 400);

  try {
    const upstream = await signedStaffRequest(
      context.env,
      `/v1/website/appeals/reviewer/${encodeURIComponent(appealId)}/decision`,
      {
        actorAccountId: session.player.uuid,
        actorRank,
        decision: decision.decision,
        expectedVersion: decision.expectedVersion,
        note: decision.note,
        idempotencyKey: decision.idempotencyKey,
      },
    );
    return staffApiResponse(upstream);
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() { return methodNotAllowed(["POST"]); }
export { sanitizeDecision };
