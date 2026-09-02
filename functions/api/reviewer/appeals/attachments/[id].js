import { authenticateRequest, canReview } from "../../../../lib/auth.js";
import {
  appealAttachmentDisposition,
  appealAttachmentResponse
} from "../../../../lib/appeal-attachment-response.js";
import { findReviewerAppealAttachment } from "../../../../lib/appeal-repository.js";
import { forbidden, json, methodNotAllowed, unauthorized } from "../../../../lib/responses.js";
import { reviewerRank } from "../../../../lib/staff-api.js";
import { isCanonicalUuid } from "../../../../lib/validation.js";

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
  return appealAttachmentResponse(object, record);
}

export function onRequest() { return methodNotAllowed(["GET"]); }

export { appealAttachmentDisposition as disposition };
