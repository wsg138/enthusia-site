import { authenticateRequest } from "../../../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase
} from "../../../../lib/competitions/access.js";
import { getAdminCompetition } from "../../../../lib/competitions/drafts.js";
import { json, methodNotAllowed, unauthorized } from "../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../lib/security.js";
import { isCanonicalUuid } from "../../../../lib/validation.js";

function competitionId(context) {
  const value = typeof context?.params?.id === "string" ? context.params.id.trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
}

function cleanReason(value) {
  if (typeof value !== "string") return null;
  const reason = value.trim().replace(/\s+/g, " ");
  return reason.length >= 3 && reason.length <= 500 ? reason : null;
}

export async function onRequestDelete(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  if (!competitionsEnabled(context.env)) return json({ error: "not_found" }, 404);
  if (!hasCompetitionDatabase(context.env)) return json({ error: "competition_database_unavailable" }, 503);
  const id = competitionId(context);
  if (!id) return json({ error: "competition_not_found" }, 404);

  let session;
  try {
    session = await authenticateRequest(context.request, context.env);
  } catch {
    return unauthorized();
  }
  if (!canManageCompetitions(session, context.env)) {
    return json({ error: "competition_manager_required" }, 403);
  }

  let input;
  try {
    input = await context.request.json();
  } catch {
    input = null;
  }
  const reason = cleanReason(input?.reason);
  if (!reason) return json({ error: "delete_reason_required" }, 400);

  try {
    const competition = await getAdminCompetition(context.env.COMPETITIONS_DB, id);
    if (!competition) return json({ error: "competition_not_found" }, 404);
    if (competition.lifecycleState !== "DRAFT") {
      return json({ error: "only_unpublished_drafts_can_be_deleted" }, 409);
    }
    const now = new Date().toISOString();
    const results = await context.env.COMPETITIONS_DB.batch([
      context.env.COMPETITIONS_DB.prepare(`
        INSERT INTO competition_deleted_drafts (
          competition_id, slug, title, category,
          deleted_by_subject, deleted_by_uuid, deleted_at, reason
        )
        SELECT id, slug, title, category, ?, ?, ?, ?
        FROM competitions
        WHERE id = ? AND lifecycle_state = 'DRAFT'
      `).bind(session.subject, session.player.uuid, now, reason, id),
      context.env.COMPETITIONS_DB.prepare(`
        DELETE FROM competitions
        WHERE id = ? AND lifecycle_state = 'DRAFT'
      `).bind(id)
    ]);
    if (Number(results?.[1]?.meta?.changes ?? 0) !== 1) {
      return json({ error: "competition_delete_conflict" }, 409);
    }
    return json({ status: "DELETED", competitionId: id, deletedAt: now });
  } catch (error) {
    if (String(error?.message ?? error).includes("UNIQUE constraint")) {
      return json({ error: "competition_already_deleted" }, 409);
    }
    return json({ error: "competition_delete_failed" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["DELETE"]);
}

export { cleanReason, competitionId };
