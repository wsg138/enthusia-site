import {
  competitionsEnabled,
  competitionsPublicAccessEnabled,
  hasCompetitionDatabase
} from "../../lib/competitions/access.js";
import { json, methodNotAllowed } from "../../lib/responses.js";

export async function onRequestGet(context) {
  if (!competitionsEnabled(context.env) || !competitionsPublicAccessEnabled(context.env)) {
    return json({ promotions: [] });
  }
  if (!hasCompetitionDatabase(context.env)) return json({ promotions: [] });

  try {
    const result = await context.env.COMPETITIONS_DB.prepare(`
      SELECT
        p.id,
        p.image_id AS imageId,
        COALESCE(p.title, s.title) AS title,
        p.caption,
        p.promoted_at AS promotedAt,
        c.slug AS competitionSlug,
        c.title AS competitionTitle,
        s.id AS submissionId,
        s.title AS submissionTitle,
        s.entry_type AS entryType,
        s.owner_name AS ownerName,
        s.guild_name_snapshot AS guildName
      FROM competition_gallery_promotions p
      JOIN competitions c ON c.id = p.competition_id
      JOIN submissions s ON s.id = p.submission_id AND s.competition_id = c.id
      JOIN submission_images i ON i.id = p.image_id AND i.submission_id = s.id
      WHERE p.removed_at IS NULL
        AND c.visibility = 'PUBLIC'
        AND c.lifecycle_state IN ('COMPLETED','ARCHIVED')
        AND s.status = 'APPROVED'
        AND s.removed_at IS NULL
        AND i.removed_at IS NULL
        AND i.moderation_state = 'PASSED'
      ORDER BY p.promoted_at DESC, p.id DESC
      LIMIT 48
    `).all();
    const promotions = (Array.isArray(result?.results) ? result.results : []).map((row) => ({
      ...row,
      imageUrl: `/api/competitions/submission-media/${encodeURIComponent(row.imageId)}`,
      competitionUrl: `/competitions/detail.html?slug=${encodeURIComponent(row.competitionSlug)}`,
      credit: row.entryType === "GUILD" && row.guildName ? row.guildName : row.ownerName
    }));
    return json({ promotions });
  } catch {
    return json({ promotions: [] });
  }
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}
