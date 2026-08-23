import { competitionsEnabled, hasCompetitionDatabase } from "../../../../lib/competitions/access.js";
import { completeDiscordOAuth } from "../../../../lib/competitions/discord-oauth.js";
import { json, methodNotAllowed } from "../../../../lib/responses.js";

export function authenticatedRedirect(url, completed) {
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL(completed.returnTo, url.origin).toString(),
      "set-cookie": completed.cookie,
      "cache-control": "no-store"
    }
  });
}

export async function onRequestGet(context) {
  if (!competitionsEnabled(context.env)) return json({ error: "not_found" }, 404);
  if (!hasCompetitionDatabase(context.env)) return json({ error: "competition_database_unavailable" }, 503);
  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || url.searchParams.has("error")) {
    return Response.redirect(new URL("/competitions/?auth=cancelled", url.origin), 303);
  }
  try {
    const completed = await completeDiscordOAuth(context.env.COMPETITIONS_DB, context.env, { code, state });
    return authenticatedRedirect(url, completed);
  } catch {
    return Response.redirect(new URL("/competitions/?auth=failed", url.origin), 303);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}
