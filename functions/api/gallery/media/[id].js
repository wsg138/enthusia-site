import { json, methodNotAllowed } from "../../../lib/responses.js";
import { isCanonicalUuid } from "../../../lib/validation.js";

export async function onRequestGet(context) {
  const id = String(context.params?.id ?? "").toLowerCase();
  if (!isCanonicalUuid(id) || !context.env?.COMPETITIONS_DB || !context.env?.COMPETITIONS_MEDIA) return json({ error: "media_not_found" }, 404);
  const row = await context.env.COMPETITIONS_DB.prepare(`SELECT storage_key AS storageKey, mime_type AS mimeType
    FROM gallery_submissions WHERE id = ? AND status = 'APPROVED'`).bind(id).first();
  if (!row) return json({ error: "media_not_found" }, 404);
  const object = await context.env.COMPETITIONS_MEDIA.get(row.storageKey);
  if (!object?.body) return json({ error: "media_not_found" }, 404);
  return new Response(object.body, { headers: { "content-type": row.mimeType, "cache-control": "public, max-age=3600", "x-content-type-options": "nosniff" } });
}
export function onRequest() { return methodNotAllowed(["GET"]); }
