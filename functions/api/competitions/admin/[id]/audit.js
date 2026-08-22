import { authenticateRequest } from "../../../../lib/auth.js";
import {
  canModerateCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase
} from "../../../../lib/competitions/access.js";
import { listCompetitionAuditEvents } from "../../../../lib/competitions/state.js";
import { json, methodNotAllowed, unauthorized } from "../../../../lib/responses.js";
import { isCanonicalUuid } from "../../../../lib/validation.js";

function competitionId(context) {
  const value = typeof context?.params?.id === "string" ? context.params.id.trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
}

export async function onRequestGet(context) {
  if (!competitionsEnabled(context.env)) return json({ error: "not_found" }, 404);

  const id = competitionId(context);
  if (!id) return json({ error: "competition_not_found" }, 404);

  let session;
  try {
    session = await authenticateRequest(context.request, context.env);
  } catch {
    return unauthorized();
  }
  if (!canModerateCompetitions(session, context.env)) {
    return json({ error: "competition_staff_required" }, 403);
  }
  if (!hasCompetitionDatabase(context.env)) {
    return json({ error: "competition_database_unavailable" }, 503);
  }

  const url = new URL(context.request.url);
  const requestedLimit = Number(url.searchParams.get("limit") || 100);
  const limit = Number.isInteger(requestedLimit) ? requestedLimit : 100;

  try {
    const events = await listCompetitionAuditEvents(context.env.COMPETITIONS_DB, id, limit);
    return json({ events });
  } catch {
    return json({ error: "competition_audit_unavailable" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}
