import { authenticateRequest, canReview } from "../../../lib/auth.js";
import { forbidden, json, methodNotAllowed, serviceUnavailable, unauthorized } from "../../../lib/responses.js";
import { boundedIdempotencyKey, requireSameOrigin } from "../../../lib/security.js";

const DECISIONS = new Set(["approve", "deny", "request_information"]);

function sanitizeDecision(input) {
  const decision = typeof input?.decision === "string" ? input.decision.trim().toLowerCase() : "";
  const expectedVersion = Number(input?.expectedVersion);
  const note = typeof input?.note === "string" ? input.note.trim() : "";
  const idempotencyKey = boundedIdempotencyKey(input?.idempotencyKey);
  if (!DECISIONS.has(decision) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) return null;
  if (note.length > 4000 || !idempotencyKey) return null;
  return { decision, expectedVersion, note, idempotencyKey };
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  let session;
  try { session = await authenticateRequest(context.request, context.env); } catch { return unauthorized(); }
  if (!canReview(session, context.env)) return forbidden();
  if (!context.env.APPEALS_API?.fetch) return serviceUnavailable();

  let decision;
  try { decision = sanitizeDecision(await context.request.json()); } catch { decision = null; }
  const appealId = String(context.params.id ?? "").trim();
  if (!decision || !/^[A-Za-z0-9._:-]{1,128}$/.test(appealId)) return json({ error: "invalid_decision" }, 400);

  const upstream = await context.env.APPEALS_API.fetch(`https://staff.internal/reviewer/appeals/${encodeURIComponent(appealId)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": decision.idempotencyKey,
      "if-match": String(decision.expectedVersion),
      "x-enthusia-reviewer-subject": session.subject,
      "x-enthusia-reviewer-player": session.player.uuid,
    },
    body: JSON.stringify({ decision: decision.decision, note: decision.note, expectedVersion: decision.expectedVersion }),
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
  });
}

export function onRequest() { return methodNotAllowed(["POST"]); }
export { sanitizeDecision };
