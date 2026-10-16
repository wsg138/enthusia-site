import { cleanGalleryText, galleryEvent, gallerySession, galleryStaffAccess } from "../../../../lib/gallery.js";
import { deleteGalleryImage } from "../../../../lib/competitions/media-storage.js";
import { json, methodNotAllowed, unauthorized } from "../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../lib/validation.js";

async function reviewGallerySubmission(context,session,access,id,row,body,action,now){
    if (!access.review) return json({ error: "staff_role_required" }, 403);
    if (row.status !== "PENDING") return json({ error: "submission_already_reviewed" }, 409);
    const status = action === "APPROVE" ? "APPROVED" : "DENIED";
    const note = action === "DENY" ? cleanGalleryText(body?.note, 300) : cleanGalleryText(body?.note, 300) ?? null;
    if (action === "DENY" && !note) return json({ error: "decision_note_required" }, 400);
    await context.env.COMPETITIONS_DB.prepare(`UPDATE gallery_submissions SET status = ?, decision_note = ?,
      reviewed_at = ?, reviewer_discord_id = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND status = 'PENDING'`)
      .bind(status, note, now, session.discord.id, now, id).run();
    await galleryEvent(context.env.COMPETITIONS_DB, id, status, session.discord.id, note ? { note } : {}, now);
    return json({ status });
}

async function editGalleryDescription(context,session,id,row,body,now){
    const description = cleanGalleryText(body?.description, 600);
    if (!description || row.status !== "APPROVED") return json({ error: "invalid_description" }, 400);
    await context.env.COMPETITIONS_DB.prepare("UPDATE gallery_submissions SET description = ?, updated_at = ?, revision = revision + 1 WHERE id = ?")
      .bind(description, now, id).run();
    await galleryEvent(context.env.COMPETITIONS_DB, id, "DESCRIPTION_EDITED", session.discord.id, {}, now);
    return json({ status: "APPROVED", description });
}

async function removeGallerySubmission(context,session,id,row,body,now){
    if (row.status !== "APPROVED") return json({ error: "submission_not_published" }, 409);
    const note = cleanGalleryText(body?.note, 300) ?? "Removed from the gallery";
    await context.env.COMPETITIONS_DB.prepare(`UPDATE gallery_submissions SET status = 'REMOVED', decision_note = ?,
      updated_at = ?, reviewer_discord_id = ?, revision = revision + 1 WHERE id = ? AND status = 'APPROVED'`)
      .bind(note, now, session.discord.id, id).run();
    await galleryEvent(context.env.COMPETITIONS_DB, id, "REMOVED", session.discord.id, { note }, now);
    await deleteGalleryImage(context.env.COMPETITIONS_MEDIA, row.storage_key).catch(() => {});
    return json({ status: "REMOVED" });
}

async function galleryMutationIdentity(context){
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const session = await gallerySession(context).catch(() => null);
  if (!session) return unauthorized();
  const access = galleryStaffAccess(session, context.env);
  const id = String(context.params?.id ?? "").toLowerCase();
  if (!isCanonicalUuid(id)) return json({ error: "submission_not_found" }, 404);
  const body = await context.request.json().catch(() => null);
  const action = String(body?.action ?? "").toUpperCase();
  return {session,access,id,body,action};
}

export async function onRequestPatch(context) {
  const authorized = await galleryMutationIdentity(context);
  if (authorized instanceof Response) return authorized;
  const {session,access,id,body,action} = authorized;
  const row = await context.env.COMPETITIONS_DB.prepare("SELECT * FROM gallery_submissions WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "submission_not_found" }, 404);
  const now = new Date().toISOString();
  if (action === "APPROVE" || action === "DENY") return reviewGallerySubmission(context,session,access,id,row,body,action,now);
  if (!access.manage) return json({ error: "developer_role_required" }, 403);
  if (action === "EDIT_DESCRIPTION") return editGalleryDescription(context,session,id,row,body,now);
  if (action === "REMOVE") return removeGallerySubmission(context,session,id,row,body,now);
  return json({ error: "invalid_action" }, 400);
}
export function onRequest() { return methodNotAllowed(["PATCH"]); }
