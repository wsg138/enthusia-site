import { readOpenAppealMutation } from "../../../../lib/appeal-mutation-response.js";
import { sanitizeReviewerReopen } from "../../../../lib/appeal-lifecycle.js";
import { recordAppealLifecycleMirror } from "../../../../lib/appeal-lifecycle-repository.js";
import { authenticateRequest, canReview } from "../../../../lib/auth.js";
import { forbidden, json, methodNotAllowed, serviceUnavailable, unauthorized } from "../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../lib/security.js";
import { reviewerRank, signedStaffRequest } from "../../../../lib/staff-api.js";
import { isCanonicalUuid, sanitizedJson } from "../../../../lib/validation.js";

const REOPEN_RANKS = new Set(["ADMIN", "FOUNDER"]);

async function authorizeMutation(context) {
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

  return { session, appealId, actorRank };
}

export async function onRequestPost(context) {
  const authorized = await authorizeMutation(context);
  if (authorized instanceof Response) return authorized;
  const { session, appealId, actorRank } = authorized;

  const input = await sanitizedJson(context.request, sanitizeReviewerReopen);
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
    const appeal = await readOpenAppealMutation(upstream, appealId, false);
    if (appeal instanceof Response) return appeal;
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
