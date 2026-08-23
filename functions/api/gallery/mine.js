import { gallerySession } from "../../lib/gallery.js";
import { json, methodNotAllowed, unauthorized } from "../../lib/responses.js";

export async function onRequestGet(context) {
  const session = await gallerySession(context).catch(() => null);
  if (!session) return unauthorized();
  const result = await context.env.COMPETITIONS_DB.prepare(`SELECT id, category, title, description, status,
    decision_note AS decisionNote, created_at AS createdAt, updated_at AS updatedAt
    FROM gallery_submissions WHERE submitter_discord_id = ? ORDER BY created_at DESC LIMIT 50`)
    .bind(session.discord.id).all();
  return json({ submissions: result.results ?? [] });
}
export function onRequest() { return methodNotAllowed(["GET"]); }
