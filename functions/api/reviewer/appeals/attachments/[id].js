import { authenticateRequest, canReview } from "../../../../lib/auth.js";
import { findReviewerAppealAttachment } from "../../../../lib/appeal-repository.js";
import { forbidden, json, methodNotAllowed, unauthorized } from "../../../../lib/responses.js";
import { reviewerRank } from "../../../../lib/staff-api.js";
import { isCanonicalUuid } from "../../../../lib/validation.js";

function disposition(record) {
  const encoded = encodeURIComponent(record.displayName).replace(/['()*]/g, (value) => (
    `%${value.codePointAt(0).toString(16).toUpperCase()}`
  ));
  return `${record.mimeType.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${encoded}`;
}

export async function onRequestGet(context) {
  let session;
  try { session = await authenticateRequest(context.request, context.env); }
  catch { return unauthorized(); }
  if (!canReview(session, context.env) || !reviewerRank(session)) return forbidden();
  const id = String(context.params.id ?? "").trim().toLowerCase();
  if (!isCanonicalUuid(id) || !context.env?.COMPETITIONS_DB || !context.env?.COMPETITIONS_MEDIA) {
    return json({ error: "attachment_not_found" }, 404);
  }
  let record;
  try { record = await findReviewerAppealAttachment(context.env.COMPETITIONS_DB, id); }
  catch { return json({ error: "attachment_unavailable" }, 503); }
  if (!record) return json({ error: "attachment_not_found" }, 404);
  let object;
  try { object = await context.env.COMPETITIONS_MEDIA.get(record.storageKey); }
  catch { return json({ error: "attachment_unavailable" }, 503); }
  if (!object) return json({ error: "attachment_not_found" }, 404);
  return new Response(object.body, {
    headers: {
      "content-type": record.mimeType,
      "content-length": String(object.size ?? record.byteSize),
      "content-disposition": disposition(record),
      "cache-control": "private, no-store",
      "content-security-policy": "default-src 'none'; sandbox",
      "x-content-type-options": "nosniff"
    }
  });
}

export function onRequest() { return methodNotAllowed(["GET"]); }

export { disposition };
