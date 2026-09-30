import { gallerySession, galleryStaffAccess } from "../../../../lib/gallery.js";
import { json, methodNotAllowed, unauthorized } from "../../../../lib/responses.js";
import { isCanonicalUuid } from "../../../../lib/validation.js";

export async function onRequestGet(context) {
  const session = await gallerySession(context).catch(() => null);
  if (!session) return unauthorized();
  if (!galleryStaffAccess(session, context.env).review) return json({ error: "staff_role_required" }, 403);
  const id = String(context.params?.id ?? "").toLowerCase();
  if (!isCanonicalUuid(id)) return json({ error: "media_not_found" }, 404);
  const row = await context.env.COMPETITIONS_DB.prepare("SELECT storage_key AS storageKey, mime_type AS mimeType FROM gallery_submissions WHERE id = ?").bind(id).first();
  const object = row && await context.env.COMPETITIONS_MEDIA.get(row.storageKey);
  if (!object?.body) return json({ error: "media_not_found" }, 404);
  return new Response(object.body, { headers: { "content-type": row.mimeType, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
export function onRequest() { return methodNotAllowed(["GET"]); }
