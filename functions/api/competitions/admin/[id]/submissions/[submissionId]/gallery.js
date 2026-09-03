import { authenticateRequest } from "../../../../../../lib/auth.js";
import {
  canModerateCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase
} from "../../../../../../lib/competitions/access.js";
import { json, methodNotAllowed, unauthorized } from "../../../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../../../lib/validation.js";

function paramUuid(context, key) {
  const value = typeof context?.params?.[key] === "string" ? context.params[key].trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
}

function cleanOptionalText(value, max) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized || normalized.length > max) return undefined;
  return normalized;
}

async function authorize(context) {
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
  if (!hasCompetitionDatabase(context.env)) return { response: json({ error: "competition_database_unavailable" }, 503) };
  let session;
  try {
    session = await authenticateRequest(context.request, context.env);
  } catch {
    return { response: unauthorized() };
  }
  if (!canModerateCompetitions(session, context.env)) {
    return { response: json({ error: "competition_moderator_required" }, 403) };
  }
  return { session };
}

async function promotionRows(db, competitionId, submissionId) {
  const result = await db.prepare(`
    SELECT
      p.id,
      p.image_id AS imageId,
      p.title,
      p.caption,
      p.promoted_by_uuid AS promotedByUuid,
      p.promoted_at AS promotedAt,
      p.removed_at AS removedAt,
      i.sort_order AS sortOrder
    FROM competition_gallery_promotions p
    JOIN submission_images i ON i.id = p.image_id
    WHERE p.competition_id = ? AND p.submission_id = ?
    ORDER BY p.removed_at IS NULL DESC, p.promoted_at DESC, p.id DESC
  `).bind(competitionId, submissionId).all();
  return Array.isArray(result?.results) ? result.results : [];
}

export async function onRequestGet(context) {
  const competitionId = paramUuid(context, "id");
  const submissionId = paramUuid(context, "submissionId");
  if (!competitionId || !submissionId) return json({ error: "submission_not_found" }, 404);
  const authorized = await authorize(context);
  if (authorized.response) return authorized.response;
  try {
    return json({ promotions: await promotionRows(context.env.COMPETITIONS_DB, competitionId, submissionId) });
  } catch {
    return json({ error: "gallery_promotions_unavailable" }, 503);
  }
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const competitionId = paramUuid(context, "id");
  const submissionId = paramUuid(context, "submissionId");
  if (!competitionId || !submissionId) return json({ error: "submission_not_found" }, 404);
  const authorized = await authorize(context);
  if (authorized.response) return authorized.response;

  let input;
  try {
    input = await context.request.json();
  } catch {
    input = null;
  }
  const action = input?.action;
  const requestedImageId = input?.imageId === null || input?.imageId === undefined || input?.imageId === ""
    ? null
    : String(input.imageId).trim().toLowerCase();
  if (requestedImageId && !isCanonicalUuid(requestedImageId)) return json({ error: "invalid_gallery_image" }, 400);

  try {
    if (action === "PROMOTE") {
      const title = cleanOptionalText(input?.title, 120);
      const caption = cleanOptionalText(input?.caption, 500);
      if (title === undefined || caption === undefined) return json({ error: "invalid_gallery_copy" }, 400);

      const candidate = await context.env.COMPETITIONS_DB.prepare(`
        SELECT
          s.id AS submissionId,
          s.title AS submissionTitle,
          s.cover_image_id AS coverImageId,
          s.status,
          c.lifecycle_state AS lifecycleState,
          c.title AS competitionTitle,
          c.slug AS competitionSlug,
          i.id AS imageId,
          i.moderation_state AS moderationState,
          i.removed_at AS imageRemovedAt
        FROM submissions s
        JOIN competitions c ON c.id = s.competition_id
        LEFT JOIN submission_images i
          ON i.id = COALESCE(?, s.cover_image_id)
         AND i.submission_id = s.id
        WHERE s.id = ? AND s.competition_id = ? AND s.removed_at IS NULL
        LIMIT 1
      `).bind(requestedImageId, submissionId, competitionId).first();

      if (!candidate) return json({ error: "submission_not_found" }, 404);
      if (!["RESULTS_READY", "COMPLETED", "ARCHIVED"].includes(candidate.lifecycleState)) {
        return json({ error: "gallery_promotion_not_available_yet" }, 409);
      }
      if (candidate.status !== "APPROVED") return json({ error: "gallery_requires_approved_submission" }, 409);
      if (!candidate.imageId || candidate.moderationState !== "PASSED" || candidate.imageRemovedAt) {
        return json({ error: "gallery_image_unavailable" }, 409);
      }

      const now = new Date().toISOString();
      const promotionId = crypto.randomUUID();
      const auditId = crypto.randomUUID();
      await context.env.COMPETITIONS_DB.batch([
        context.env.COMPETITIONS_DB.prepare(`
          INSERT INTO competition_gallery_promotions (
            id, competition_id, submission_id, image_id, title, caption,
            promoted_by_uuid, promoted_at, removed_at, removed_by_uuid
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
          ON CONFLICT(submission_id, image_id) DO UPDATE SET
            title = excluded.title,
            caption = excluded.caption,
            promoted_by_uuid = excluded.promoted_by_uuid,
            promoted_at = excluded.promoted_at,
            removed_at = NULL,
            removed_by_uuid = NULL
        `).bind(
          promotionId,
          competitionId,
          submissionId,
          candidate.imageId,
          title,
          caption,
          authorized.session.player.uuid,
          now
        ),
        context.env.COMPETITIONS_DB.prepare(`
          INSERT INTO competition_audit_events (
            id, competition_id, submission_id, actor_subject, actor_uuid,
            action, after_json, note, created_at
          ) VALUES (?, ?, ?, ?, ?, 'SUBMISSION_GALLERY_PROMOTED', ?, ?, ?)
        `).bind(
          auditId,
          competitionId,
          submissionId,
          authorized.session.subject,
          authorized.session.player.uuid,
          JSON.stringify({ imageId: candidate.imageId, title, caption }),
          "Submission image promoted to Gallery",
          now
        )
      ]);
      return json({
        status: "PROMOTED",
        imageId: candidate.imageId,
        publicAt: ["COMPLETED", "ARCHIVED"].includes(candidate.lifecycleState)
      });
    }

    if (action === "REMOVE") {
      if (!requestedImageId) return json({ error: "gallery_image_required" }, 400);
      const now = new Date().toISOString();
      const results = await context.env.COMPETITIONS_DB.batch([
        context.env.COMPETITIONS_DB.prepare(`
          UPDATE competition_gallery_promotions
          SET removed_at = ?, removed_by_uuid = ?
          WHERE competition_id = ? AND submission_id = ? AND image_id = ? AND removed_at IS NULL
        `).bind(now, authorized.session.player.uuid, competitionId, submissionId, requestedImageId),
        context.env.COMPETITIONS_DB.prepare(`
          INSERT INTO competition_audit_events (
            id, competition_id, submission_id, actor_subject, actor_uuid,
            action, after_json, note, created_at
          )
          SELECT ?, ?, ?, ?, ?, 'SUBMISSION_GALLERY_REMOVED', ?, ?, ?
          WHERE changes() = 1
        `).bind(
          crypto.randomUUID(),
          competitionId,
          submissionId,
          authorized.session.subject,
          authorized.session.player.uuid,
          JSON.stringify({ imageId: requestedImageId }),
          "Submission image removed from Gallery",
          now
        )
      ]);
      if (Number(results?.[0]?.meta?.changes ?? 0) !== 1) return json({ error: "gallery_promotion_not_found" }, 404);
      return json({ status: "REMOVED", imageId: requestedImageId });
    }

    return json({ error: "invalid_gallery_action" }, 400);
  } catch {
    return json({ error: "gallery_promotion_failed" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET", "POST"]);
}

export { cleanOptionalText, paramUuid };
