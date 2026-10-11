import { competitionsEnabled, hasCompetitionDatabase } from "../../../lib/competitions/access.js";
import {
  clearCompetitionSessionCookie,
  deleteCompetitionIdentitySession
} from "../../../lib/competitions/identity.js";
import { json, methodNotAllowed } from "../../../lib/responses.js";
import { requireSameOrigin } from "../../../lib/security.js";

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  if (!competitionsEnabled(context.env)) return json({ error: "not_found" }, 404);
  if (!hasCompetitionDatabase(context.env)) return json({ error: "competition_database_unavailable" }, 503);
  await deleteCompetitionIdentitySession(context.request, context.env.COMPETITIONS_DB).catch(() => false);
  const response = json({ status: "SIGNED_OUT" });
  response.headers.append("set-cookie", clearCompetitionSessionCookie());
  response.headers.set("cache-control", "no-store");
  return response;
}

export function onRequest() {
  return methodNotAllowed(["POST"]);
}
