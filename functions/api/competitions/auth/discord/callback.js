import { competitionsEnabled, hasCompetitionDatabase } from "../../../../lib/competitions/access.js";
import { completeDiscordOAuth } from "../../../../lib/competitions/discord-oauth.js";
import { json, methodNotAllowed } from "../../../../lib/responses.js";
import { clearOauthBrowserCookie, oauthBrowserMatches, oauthRedirect } from "../../../../lib/competitions/oauth-browser.js";

export function authenticatedRedirect(url, completed) {
  const response=oauthRedirect(new URL(completed.returnTo,url.origin).toString(),completed.cookie);
  response.headers.append("set-cookie",clearOauthBrowserCookie());
  return response;
}

export async function onRequestGet(context) {
  if (!competitionsEnabled(context.env)) return json({ error: "not_found" }, 404);
  if (!hasCompetitionDatabase(context.env)) return json({ error: "competition_database_unavailable" }, 503);
  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if(!oauthBrowserMatches(context.request,state)) {
    return oauthRedirect(new URL("/competitions/?auth=failed",url.origin).toString());
  }
  if (!code || !state || url.searchParams.has("error")) {
    return oauthRedirect(new URL("/competitions/?auth=cancelled", url.origin).toString(),clearOauthBrowserCookie());
  }
  try {
    const completed = await completeDiscordOAuth(context.env.COMPETITIONS_DB, context.env, { code, state });
    return authenticatedRedirect(url, completed);
  } catch {
    return oauthRedirect(new URL("/competitions/?auth=failed", url.origin).toString(),clearOauthBrowserCookie());
  }
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}
