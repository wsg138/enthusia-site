import { competitionsEnabled, hasCompetitionDatabase } from "../../../../lib/competitions/access.js";
import { beginDiscordOAuth } from "../../../../lib/competitions/discord-oauth.js";
import { json, methodNotAllowed } from "../../../../lib/responses.js";

export async function onRequestGet(context) {
  if (!competitionsEnabled(context.env)) return json({ error: "not_found" }, 404);
  if (!hasCompetitionDatabase(context.env)) return json({ error: "competition_database_unavailable" }, 503);
  const returnTo = new URL(context.request.url).searchParams.get("returnTo") ?? "/competitions/";
  try {
    const oauth = await beginDiscordOAuth(context.env.COMPETITIONS_DB, context.env, returnTo);
    return Response.redirect(oauth.url, 302);
  } catch {
    return json({ error: "discord_oauth_unavailable" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}
