import {
  competitionSessionCookie,
  consumeOAuthState,
  createIdentitySession,
  createOAuthState
} from "./identity.js";

const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_USER_URL = "https://discord.com/api/v10/users/@me";
const DISCORD_ID = /^\d{16,22}$/;

function environmentValue(env, key) {
  if (!env || typeof env !== "object") return "";
  return String(env[key] ?? "").trim();
}

function discordCredentials(env) {
  const clientId = environmentValue(env, "DISCORD_CLIENT_ID");
  const clientSecret = environmentValue(env, "DISCORD_CLIENT_SECRET");
  const guildId = environmentValue(env, "DISCORD_GUILD_ID");
  if (!DISCORD_ID.test(clientId) || clientSecret.length < 16 || !DISCORD_ID.test(guildId)) {
    throw new Error("Discord OAuth is not configured");
  }
  return { clientId, clientSecret, guildId };
}

function parseRedirectUri(value) {
  let redirectUrl;
  try {
    redirectUrl = new URL(value);
  } catch {
    throw new Error("Discord OAuth redirect URI is invalid");
  }
  const secure = redirectUrl.protocol === "https:";
  const localDevelopment = redirectUrl.protocol === "http:" && redirectUrl.hostname === "localhost";
  if (!secure && !localDevelopment) {
    throw new Error("Discord OAuth redirect URI must use HTTPS");
  }
  return redirectUrl.toString();
}

function configuration(env) {
  return {
    ...discordCredentials(env),
    redirectUri: parseRedirectUri(environmentValue(env, "DISCORD_OAUTH_REDIRECT_URI"))
  };
}

export async function beginDiscordOAuth(db, env, returnTo) {
  const config = configuration(env);
  const { state, expiresAt } = await createOAuthState(db, returnTo);
  const url = new URL(DISCORD_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("scope", "identify guilds.members.read");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", config.redirectUri);
  // Do not force prompt=none: first-time users must be allowed to see Discord's
  // normal authorization/login UI. The requested scopes are limited to identity
  // and membership in the configured server.
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

function discordRoleIds(body) {
  if (!body || !Array.isArray(body.roles)) return null;
  return body.roles.map(String).filter((role) => DISCORD_ID.test(role));
}

async function fetchDiscordMembership(accessToken, env, fetchImpl = fetch) {
  const guildId = environmentValue(env, "DISCORD_GUILD_ID");
  if (!DISCORD_ID.test(guildId)) return { member: false, roleIds: [] };
  const response = await fetchImpl(`${DISCORD_USER_URL}/guilds/${guildId}/member`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (response.status === 404) return { member: false, roleIds: [] };
  const body = await response.json().catch(() => null);
  const roleIds = discordRoleIds(body);
  if (!response.ok || roleIds === null) throw new Error(`Discord member lookup failed: ${response.status}`);
  return {
    member: true,
    roleIds
  };
}

function oauthCallbackValue(value, maximumLength) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximumLength ? normalized : null;
}

export async function completeDiscordOAuth(db, env, { code, state }, fetchImpl = fetch) {
  const safeCode = oauthCallbackValue(code, 512);
  const safeState = oauthCallbackValue(state, 256);
  if (safeCode === null || safeState === null) {
    throw new TypeError("Discord OAuth callback is invalid");
  }
  const oauthState = await consumeOAuthState(db, safeState);
  if (!oauthState) throw new Error("Discord OAuth state is invalid or expired");

  const accessToken = await exchangeAuthorizationCode(env, safeCode, fetchImpl);
  const user = await fetchDiscordUser(accessToken, fetchImpl);
  const membership = await fetchDiscordMembership(accessToken, env, fetchImpl);
  const session = await createIdentitySession(db, { ...user, guildMember: membership.member, roleIds: membership.roleIds });
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
  discordRoleIds,
  fetchDiscordMembership,
  fetchDiscordUser,
  oauthCallbackValue
};
