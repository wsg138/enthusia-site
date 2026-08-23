import {
  competitionSessionCookie,
  consumeOAuthState,
  createIdentitySession,
  createOAuthState
} from "./identity.js";

const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_USER_URL = "https://discord.com/api/v10/users/@me";

function configuration(env) {
  const clientId = String(env?.DISCORD_CLIENT_ID ?? "").trim();
  const clientSecret = String(env?.DISCORD_CLIENT_SECRET ?? "").trim();
  const redirectUri = String(env?.DISCORD_OAUTH_REDIRECT_URI ?? "").trim();
  if (!/^\d{16,22}$/.test(clientId) || clientSecret.length < 16) {
    throw new Error("Discord OAuth is not configured");
  }
  let redirect;
  try {
    redirect = new URL(redirectUri);
  } catch {
    throw new Error("Discord OAuth redirect URI is invalid");
  }
  if (redirect.protocol !== "https:" && redirect.hostname !== "localhost") {
    throw new Error("Discord OAuth redirect URI must use HTTPS");
  }
  return { clientId, clientSecret, redirectUri: redirect.toString() };
}

export async function beginDiscordOAuth(db, env, returnTo) {
  const config = configuration(env);
  const { state, expiresAt } = await createOAuthState(db, returnTo);
  const url = new URL(DISCORD_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("prompt", "none");
  return { url: url.toString(), expiresAt };
}

async function exchangeAuthorizationCode(env, code, fetchImpl = fetch) {
  const config = configuration(env);
  const form = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri
  });
  const response = await fetchImpl(DISCORD_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form
  });
  const body = await response.json().catch(() => null);
  const accessToken = String(body?.access_token ?? "").trim();
  if (!response.ok || !accessToken) throw new Error(`Discord OAuth token exchange failed: ${response.status}`);
  return accessToken;
}

async function fetchDiscordUser(accessToken, fetchImpl = fetch) {
  const response = await fetchImpl(DISCORD_USER_URL, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.id || !body?.username) {
    throw new Error(`Discord user lookup failed: ${response.status}`);
  }
  return body;
}

export async function completeDiscordOAuth(db, env, { code, state }, fetchImpl = fetch) {
  const safeCode = typeof code === "string" ? code.trim() : "";
  const safeState = typeof state === "string" ? state.trim() : "";
  if (!safeCode || safeCode.length > 512 || !safeState || safeState.length > 256) {
    throw new TypeError("Discord OAuth callback is invalid");
  }
  const oauthState = await consumeOAuthState(db, safeState);
  if (!oauthState) throw new Error("Discord OAuth state is invalid or expired");

  const accessToken = await exchangeAuthorizationCode(env, safeCode, fetchImpl);
  const user = await fetchDiscordUser(accessToken, fetchImpl);
  const session = await createIdentitySession(db, user);
  return {
    returnTo: oauthState.returnTo,
    cookie: competitionSessionCookie(session.token),
    user: session.user,
    expiresAt: session.expiresAt
  };
}

export function discordOAuthConfigured(env) {
  try {
    configuration(env);
    return true;
  } catch {
    return false;
  }
}

export {
  DISCORD_AUTHORIZE_URL,
  DISCORD_TOKEN_URL,
  DISCORD_USER_URL,
  configuration as discordOAuthConfiguration,
  exchangeAuthorizationCode,
  fetchDiscordUser
};
