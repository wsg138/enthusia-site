import { cleanupAppealAttachment } from "../../../lib/appeal-attachments.js";
import { findOwnedAppealAttachment, removeDraftAttachment } from "../../../lib/appeal-repository.js";
import { authenticateLinkedAppealRequest } from "../../../lib/appeal-session.js";
import { json, methodNotAllowed, unauthorized } from "../../../lib/responses.js";
import { requireSameOrigin } from "../../../lib/security.js";
import { isCanonicalUuid } from "../../../lib/validation.js";

async function resolve(context) {
  if (!context.env?.COMPETITIONS_DB || !context.env?.COMPETITIONS_MEDIA) {
    return { response: json({ error: "attachment_not_found" }, 404) };
  }
  let session;
  try { session = await authenticateLinkedAppealRequest(context.request, context.env); }
  catch { return { response: json({ error: "appeal_identity_unavailable" }, 503) }; }
  if (!session) return { response: unauthorized() };
  const id = String(context.params.id ?? "").trim().toLowerCase();
  if (!isCanonicalUuid(id)) return { response: json({ error: "attachment_not_found" }, 404) };
  let record;
  try { record = await findOwnedAppealAttachment(context.env.COMPETITIONS_DB, session.discord.id, id); }
  catch { return { response: json({ error: "appeal_attachments_unavailable" }, 503) }; }
  return record ? { session, record } : { response: json({ error: "attachment_not_found" }, 404) };
}

function disposition(record) {
  const encoded = encodeURIComponent(record.displayName).replace(/['()*]/g, (value) => (
    `%${value.codePointAt(0).toString(16).toUpperCase()}`
  ));
  return `${record.mimeType.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${encoded}`;
}

export async function onRequestGet(context) {
  const resolved = await resolve(context);
  if (resolved.response) return resolved.response;
  let object;
  try { object = await context.env.COMPETITIONS_MEDIA.get(resolved.record.storageKey); }
  catch { return json({ error: "attachment_unavailable" }, 503); }
  if (!object) return json({ error: "attachment_not_found" }, 404);
  return new Response(object.body, {
    headers: {
      "content-type": resolved.record.mimeType,
      "content-length": String(object.size ?? resolved.record.byteSize),
      "content-disposition": disposition(resolved.record),
      "cache-control": "private, no-store",
      "content-security-policy": "default-src 'none'; sandbox",
      "x-content-type-options": "nosniff"
    }
  });
}

export async function onRequestDelete(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const resolved = await resolve(context);
  if (resolved.response) return resolved.response;
  const draftId = new URL(context.request.url).searchParams.get("draftId")?.trim().toLowerCase();
  if (!isCanonicalUuid(draftId) || resolved.record.draftId !== draftId || resolved.record.appealId) {
    return json({ error: "attachment_locked" }, 409);
  }
  let removed;
  try {
    removed = await removeDraftAttachment(
      context.env.COMPETITIONS_DB,
      resolved.session.discord.id,
      resolved.record.id,
      draftId
    );
  } catch {
    return json({ error: "attachment_delete_failed" }, 503);
  }
  if (!removed) return json({ error: "attachment_locked" }, 409);
  await cleanupAppealAttachment(context, context.env.COMPETITIONS_MEDIA, resolved.record.storageKey);
  return json({ status: "DELETED" });
}

export function onRequest() { return methodNotAllowed(["GET", "DELETE"]); }

export { disposition, resolve };
