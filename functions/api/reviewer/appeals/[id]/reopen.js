import { sanitizeReviewerReopen, projectAppealMutation } from "../../../../lib/appeal-lifecycle.js";
import { recordAppealLifecycleMirror } from "../../../../lib/appeal-lifecycle-repository.js";
import { authenticateRequest, canReview } from "../../../../lib/auth.js";
import { forbidden, json, methodNotAllowed, serviceUnavailable, unauthorized } from "../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../lib/security.js";
import { reviewerRank, signedStaffRequest, staffApiResponse } from "../../../../lib/staff-api.js";
import { isCanonicalUuid } from "../../../../lib/validation.js";

const REOPEN_RANKS = new Set(["ADMIN", "FOUNDER"]);

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  if (!context.env?.COMPETITIONS_DB) return serviceUnavailable();
  const appealId = String(context.params.id ?? "").trim().toLowerCase();
  if (!isCanonicalUuid(appealId)) return json({ error: "invalid_appeal" }, 400);

  let session;
  try { session = await authenticateRequest(context.request, context.env); }
  catch { return unauthorized(); }
  if (!canReview(session, context.env)) return forbidden();
  const actorRank = reviewerRank(session);
  if (!REOPEN_RANKS.has(actorRank)) return forbidden();

  let input;
  try { input = sanitizeReviewerReopen(await context.request.json()); }
  catch { input = null; }
  if (!input) return json({ error: "invalid_reopen" }, 400);

  try {
    const upstream = await signedStaffRequest(
      context.env,
      `/v1/website/appeals/reviewer/${appealId}/reopen`,
      {
        actorAccountId: session.player.uuid,
        actorRank,
        expectedVersion: input.expectedVersion,
        note: input.note,
        idempotencyKey: input.idempotencyKey
      }
    );
    if (!upstream.ok) return staffApiResponse(upstream, "private, no-store");
    let payload;
    try { payload = await upstream.json(); } catch { return serviceUnavailable(); }
    const appeal = projectAppealMutation(payload, appealId);
    if (!appeal || appeal.claimed || appeal.status !== "OPEN") return serviceUnavailable();
    const mirrored = await recordAppealLifecycleMirror(context.env.COMPETITIONS_DB, {
      appealId,
      status: appeal.status,
      version: appeal.version,
      claimed: false,
      updatedAt: appeal.updatedAt ?? new Date().toISOString()
    });
    if (!mirrored) return serviceUnavailable();
    return json({ appeal }, 200, { "cache-control": "private, no-store" });
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() { return methodNotAllowed(["POST"]); }
