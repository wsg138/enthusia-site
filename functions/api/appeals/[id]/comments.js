import { sanitizeAppealComment } from "../../../lib/appeal-comments.js";
import { findOwnedAppeal, recordAppealComment } from "../../../lib/appeal-repository.js";
import { authenticateLinkedAppealRequest } from "../../../lib/appeal-session.js";
import { json, methodNotAllowed, serviceUnavailable, unauthorized } from "../../../lib/responses.js";
import { requireSameOrigin } from "../../../lib/security.js";
import { isCanonicalUuid } from "../../../lib/validation.js";

const COMMENTABLE_STATUSES = new Set(["OPEN", "INFORMATION_REQUESTED"]);

function authorName(session) {
  return String(session.discord?.globalName || session.discord?.username || "Player").slice(0, 64);
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  if (!context.env?.COMPETITIONS_DB) return serviceUnavailable();
  const appealId = String(context.params.id ?? "").trim().toLowerCase();
  if (!isCanonicalUuid(appealId)) return json({ error: "invalid_appeal" }, 400);
  let session;
  try { session = await authenticateLinkedAppealRequest(context.request, context.env); }
  catch { return serviceUnavailable(); }
  if (!session) return unauthorized();
  let input;
  try { input = sanitizeAppealComment(await context.request.json()); }
  catch { input = null; }
  if (!input) return json({ error: "invalid_comment" }, 400);

  try {
    const appeal = await findOwnedAppeal(context.env.COMPETITIONS_DB, session.discord.id, appealId);
    if (!appeal) return json({ error: "appeal_not_found" }, 404);
    if (!COMMENTABLE_STATUSES.has(appeal.status)) {
      return json({ error: "appeal_closed" }, 409);
    }
    const recorded = await recordAppealComment(context.env.COMPETITIONS_DB, {
      id: crypto.randomUUID(),
      appealId,
      authorType: "PLAYER",
      authorId: session.discord.id,
      authorName: authorName(session),
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

export { COMMENTABLE_STATUSES };
