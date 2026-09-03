import { gallerySession, galleryStaffAccess } from "../../lib/gallery.js";
import { json, methodNotAllowed } from "../../lib/responses.js";

export async function onRequestGet(context) {
  const session = await gallerySession(context).catch(() => null);
  if (!session) return json({ authenticated: false, staff: { review: false, manage: false } });
  return json({ authenticated: true, discord: session.discord, staff: galleryStaffAccess(session, context.env) });
}
export function onRequest() { return methodNotAllowed(["GET"]); }
