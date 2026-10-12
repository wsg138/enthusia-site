import { authenticateRequest } from "../../../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase
} from "../../../../lib/competitions/access.js";
import { deleteCompetitionDraft } from "../../../../lib/competitions/draft-deletion.js";
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

async function authorizeDeletion(context) {
  if (!requireSameOrigin(context.request)) return { response: json({ error: "invalid_origin" }, 403) };
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
  if (!hasCompetitionDatabase(context.env)) return { response: json({ error: "competition_database_unavailable" }, 503) };
  const id = competitionId(context);
  if (!id) return { response: json({ error: "competition_not_found" }, 404) };

  let session;
  try {
    session = await authenticateRequest(context.request, context.env);
  } catch {
    return { response: unauthorized() };
  }
  if (!canManageCompetitions(session, context.env)) {
    return { response: json({ error: "competition_manager_required" }, 403) };
  }
  return { id, session };
}

async function deleteReason(request) {
  try {
    const input = await request.json();
    return cleanReason(input?.reason);
  } catch {
    return null;
  }
}

async function deleteDraftResponse(context, authorized, reason) {
  const database = context.env.COMPETITIONS_DB;
  const competition = await getAdminCompetition(database, authorized.id);
  if (!competition) return json({ error: "competition_not_found" }, 404);
  if (competition.lifecycleState !== "DRAFT") {
    return json({ error: "only_unpublished_drafts_can_be_deleted" }, 409);
  }
  const deletedAt = new Date().toISOString();
  const deleted = await deleteCompetitionDraft(database, {
    competitionId: authorized.id,
    deletedBySubject: authorized.session.subject,
    deletedByUuid: authorized.session.player.uuid,
    deletedAt,
    reason
  });
  return deleted
    ? json({ status: "DELETED", competitionId: authorized.id, deletedAt })
    : json({ error: "competition_delete_conflict" }, 409);
}

function deletionFailureResponse(error) {
  return String(error?.message ?? error).includes("UNIQUE constraint")
    ? json({ error: "competition_already_deleted" }, 409)
    : json({ error: "competition_delete_failed" }, 503);
}

export async function onRequestDelete(context) {
  const authorized = await authorizeDeletion(context);
  if (authorized.response) return authorized.response;
  const reason = await deleteReason(context.request);
  if (!reason) return json({ error: "delete_reason_required" }, 400);

  try {
    return await deleteDraftResponse(context, authorized, reason);
  } catch (error) {
    return deletionFailureResponse(error);
  }
}

export function onRequest() {
  return methodNotAllowed(["DELETE"]);
}

export { cleanReason, competitionId, deletionFailureResponse };
