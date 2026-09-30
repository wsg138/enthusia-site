import { competitionImageLimits } from "../../lib/competitions/media-policy.js";
import { prepareGalleryImage, storePreparedCompetitionImage, deleteGalleryImage } from "../../lib/competitions/media-storage.js";
import { cleanGalleryText, gallerySession, SUBMITTABLE_CATEGORIES } from "../../lib/gallery.js";
import { json, methodNotAllowed, unauthorized } from "../../lib/responses.js";
import { requireSameOrigin } from "../../lib/security.js";

export async function onRequestGet(context) {
  if (!context.env?.COMPETITIONS_DB) return json({ error: "gallery_unavailable" }, 503);
  const category = new URL(context.request.url).searchParams.get("category")?.toUpperCase();
  const filter = category ? "AND category = ?" : "";
  if (category && !SUBMITTABLE_CATEGORIES.has(category) && !["PVP", "BETA_1", "BETA_2", "BETA_3"].includes(category)) {
    return json({ error: "invalid_category" }, 400);
  }
  const statement = context.env.COMPETITIONS_DB.prepare(`SELECT id, category, title, description,
    submitter_display_name AS submitterDisplayName, reviewed_at AS publishedAt, width, height
    FROM gallery_submissions WHERE status = 'APPROVED' ${filter}
    ORDER BY reviewed_at DESC LIMIT 100`);
  const result = await (category ? statement.bind(category) : statement).all();
  return json({ submissions: (result.results ?? []).map((row) => ({ ...row, imageUrl: `/api/gallery/media/${row.id}` })) });
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  if (!context.env?.COMPETITIONS_DB || !context.env?.COMPETITIONS_MEDIA) return json({ error: "gallery_unavailable" }, 503);
  const session = await gallerySession(context).catch(() => null);
  if (!session) return unauthorized();
  let form;
  try { form = await context.request.formData(); } catch { return json({ error: "invalid_form" }, 400); }
  const category = String(form.get("category") ?? "").toUpperCase();
  const title = cleanGalleryText(form.get("title"), 80);
  const description = cleanGalleryText(form.get("description"), 600);
  const image = form.get("image");
  if (!SUBMITTABLE_CATEGORIES.has(category) || !title || !description) return json({ error: "invalid_submission" }, 400);
  if (!(image instanceof File) || image.size < 1 || image.size > competitionImageLimits().maxBytes) return json({ error: "invalid_image" }, 400);
  const id = crypto.randomUUID();
  const prepared = await prepareGalleryImage({ data: new Uint8Array(await image.arrayBuffer()), mediaId: id, env: context.env }).catch(() => null);
  if (!prepared) return json({ error: "image_processing_failed" }, 400);
  if (prepared.status === "REJECTED") return json({ error: prepared.error }, 400);
  if (prepared.status === "BLOCKED") return json({ error: "image_blocked_by_moderation" }, 422);
  if (prepared.status !== "READY") return json({ error: "image_moderation_unavailable" }, 503);
  let stored;
  try { stored = await storePreparedCompetitionImage(context.env.COMPETITIONS_MEDIA, prepared); }
  catch { return json({ error: "gallery_storage_failed" }, 503); }
  const now = new Date().toISOString();
  const displayName = session.discord.globalName || session.discord.username;
  try {
    await context.env.COMPETITIONS_DB.batch([
      context.env.COMPETITIONS_DB.prepare(`INSERT INTO gallery_submissions
        (id, category, title, description, submitter_discord_id, submitter_display_name, status,
         storage_key, sha256, mime_type, byte_size, width, height, moderation_provider, moderation_model,
         created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, category, title, description, session.discord.id, displayName, stored.key, stored.sha256,
          stored.mimeType, stored.size, stored.width, stored.height, stored.moderation.provider,
          stored.moderation.model, now, now),
      context.env.COMPETITIONS_DB.prepare(`INSERT INTO gallery_submission_events
        (id, submission_id, event_type, actor_discord_id, detail_json, created_at)
        VALUES (?, ?, 'SUBMITTED', ?, '{}', ?)`)
        .bind(crypto.randomUUID(), id, session.discord.id, now)
    ]);
    return json({ submission: { id, category, title, description, status: "PENDING", createdAt: now } }, 201);
  } catch {
    await deleteGalleryImage(context.env.COMPETITIONS_MEDIA, stored.key).catch(() => {});
    return json({ error: "gallery_submission_failed" }, 503);
  }
}

export function onRequest() { return methodNotAllowed(["GET", "POST"]); }
