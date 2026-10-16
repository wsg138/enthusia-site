import { competitionsEnabled, hasCompetitionDatabase } from "../../../../lib/competitions/access.js";
import { beginDiscordOAuth } from "../../../../lib/competitions/discord-oauth.js";
import { json, methodNotAllowed } from "../../../../lib/responses.js";
import { oauthBrowserCookie, oauthRedirect } from "../../../../lib/competitions/oauth-browser.js";
import { competitionRateLimit,rateLimitHeaders } from "../../../../lib/competitions/rate-limit.js";

export async function onRequestGet(context) {
  if (!competitionsEnabled(context.env)) return json({ error: "not_found" }, 404);
  if (!hasCompetitionDatabase(context.env)) return json({ error: "competition_database_unavailable" }, 503);
  const returnTo = new URL(context.request.url).searchParams.get("returnTo") ?? "/competitions/";
  try {
    const limited=await competitionRateLimit(context.env.COMPETITIONS_DB,{
      scope:"oauth-start",identity:context.request.headers.get("CF-Connecting-IP")||"unknown",limit:30,windowSeconds:600});
    if(!limited.allowed)return json({error:"rate_limited"},429,rateLimitHeaders(limited));
    const oauth = await beginDiscordOAuth(context.env.COMPETITIONS_DB, context.env, returnTo);
    return oauthRedirect(oauth.url,oauthBrowserCookie(new URL(oauth.url).searchParams.get("state")),302);
  } catch {
    return json({ error: "discord_oauth_unavailable" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}
