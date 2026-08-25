import { authenticateRequest, canReview } from "../../../../lib/auth.js";
import { sanitizeAppealComment } from "../../../../lib/appeal-comments.js";
import { findAppeal, recordAppealComment } from "../../../../lib/appeal-repository.js";
import { forbidden, json, methodNotAllowed, serviceUnavailable, unauthorized } from "../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../lib/security.js";
import { reviewerRank } from "../../../../lib/staff-api.js";
import { isCanonicalUuid } from "../../../../lib/validation.js";

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  if (!context.env?.COMPETITIONS_DB) return serviceUnavailable();
  const appealId = String(context.params.id ?? "").trim().toLowerCase();
  if (!isCanonicalUuid(appealId)) return json({ error: "invalid_appeal" }, 400);
  let session;
  try { session = await authenticateRequest(context.request, context.env); }
  catch { return unauthorized(); }
  if (!canReview(session, context.env) || !reviewerRank(session)) return forbidden();
  let input;
  try { input = sanitizeAppealComment(await context.request.json()); }
  catch { input = null; }
  if (!input) return json({ error: "invalid_comment" }, 400);

  try {
    if (!await findAppeal(context.env.COMPETITIONS_DB, appealId)) {
      return json({ error: "appeal_not_found" }, 404);
    }
    const recorded = await recordAppealComment(context.env.COMPETITIONS_DB, {
      id: crypto.randomUUID(),
      appealId,
      authorType: "STAFF",
      authorId: session.player.uuid,
      authorName: session.player.name,
      body: input.body,
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date().toISOString()
    });
    if (recorded.status === "CONFLICT") return json({ error: "comment_conflict" }, 409);
    return json({ comment: recorded.comment }, recorded.status === "CREATED" ? 201 : 200);
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() { return methodNotAllowed(["POST"]); }
