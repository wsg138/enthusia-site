import { hasCompetitionDatabase } from "../../lib/competitions/access.js";
import { authorizeCompetitionRead } from "../../lib/competitions/public-access.js";
import { publicCompetitionDetail } from "../../lib/competitions/public.js";
import { listPublicCompetitions } from "../../lib/competitions/repository.js";
import { json, methodNotAllowed } from "../../lib/responses.js";

export async function onRequestGet(context) {
  const authorized = await authorizeCompetitionRead(context);
  if (authorized.response) return authorized.response;

  if (!hasCompetitionDatabase(context.env)) {
    return json({ error: "competition_database_unavailable" }, 503);
  }

  try {
    const competitions = await listPublicCompetitions(context.env.COMPETITIONS_DB);
    return json({ competitions: competitions.map(publicCompetitionDetail) });
  } catch {
    return json({ error: "competition_catalog_unavailable" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}
