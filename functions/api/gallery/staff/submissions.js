import { gallerySession, galleryStaffAccess } from "../../../lib/gallery.js";
import { json, methodNotAllowed, unauthorized } from "../../../lib/responses.js";

export async function onRequestGet(context) {
  const session = await gallerySession(context).catch(() => null);
  if (!session) return unauthorized();
  if (!galleryStaffAccess(session, context.env).review) return json({ error: "staff_role_required" }, 403);
  const result = await context.env.COMPETITIONS_DB.prepare(`SELECT id, category, title, description,
    submitter_display_name AS submitterDisplayName, status, decision_note AS decisionNote,
    created_at AS createdAt, updated_at AS updatedAt, revision
    FROM gallery_submissions WHERE status IN ('PENDING', 'APPROVED')
    ORDER BY CASE status WHEN 'PENDING' THEN 0 ELSE 1 END, created_at ASC LIMIT 100`).all();
  return json({ submissions: (result.results ?? []).map((row) => ({ ...row, previewUrl: `/api/gallery/staff/media/${row.id}` })) });
}
export function onRequest() { return methodNotAllowed(["GET"]); }
