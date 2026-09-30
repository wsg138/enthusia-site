import assert from "node:assert/strict";
import test from "node:test";

import {
  beginDiscordOAuth,
  discordOAuthConfiguration,
  discordOAuthConfigured,
  discordRoleIds,
  fetchDiscordMembership,
  oauthCallbackValue
} from "../functions/lib/competitions/discord-oauth.js";
import { safeReturnTo } from "../functions/lib/competitions/identity.js";
import { authenticatedRedirect } from "../functions/api/competitions/auth/discord/callback.js";

function writeOnlyDb() {
  return {
    prepare() {
      return {
        bind() {
          return { async run() { return { meta: { changes: 1 } }; } };
        }
      };
    }
  };
}

const ENV = {
  DISCORD_CLIENT_ID: "1".repeat(18),
  DISCORD_CLIENT_SECRET: "not-a-real-secret",
  DISCORD_GUILD_ID: "6".repeat(18),
  DISCORD_OAUTH_REDIRECT_URI: "https://competitions-dev.example.com/api/competitions/auth/discord/callback"
};

test("Discord competition OAuth uses identify and allows interactive first-time authorization", async () => {
  const oauth = await beginDiscordOAuth(writeOnlyDb(), ENV, "/competitions/detail.html?competition=test");
  const url = new URL(oauth.url);
  assert.equal(url.origin, "https://discord.com");
  assert.equal(url.pathname, "/oauth2/authorize");
  assert.equal(url.searchParams.get("client_id"), ENV.DISCORD_CLIENT_ID);
  assert.equal(url.searchParams.get("scope"), "identify guilds.members.read");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("redirect_uri"), ENV.DISCORD_OAUTH_REDIRECT_URI);
  assert.ok(url.searchParams.get("state"));
  assert.equal(url.searchParams.has("prompt"), false);
});

test("Discord OAuth configuration fails closed for missing secret or insecure redirect", () => {
  assert.equal(discordOAuthConfigured(ENV), true);
  assert.throws(() => discordOAuthConfiguration({ ...ENV, DISCORD_CLIENT_SECRET: "" }), /not configured/);
  assert.throws(() => discordOAuthConfiguration({ ...ENV, DISCORD_GUILD_ID: "" }), /not configured/);
  assert.throws(() => discordOAuthConfiguration({ ...ENV, DISCORD_OAUTH_REDIRECT_URI: "http://example.com/callback" }), /HTTPS/);
  assert.throws(() => discordOAuthConfiguration({ ...ENV, DISCORD_OAUTH_REDIRECT_URI: "ftp://localhost/callback" }), /HTTPS/);
  assert.equal(
    discordOAuthConfiguration({ ...ENV, DISCORD_OAUTH_REDIRECT_URI: "http://localhost:8788/callback" }).redirectUri,
    "http://localhost:8788/callback"
  );
});

test("Discord OAuth returns to safe same-site pages", () => {
  assert.equal(safeReturnTo("/appeal.html?punishment=test"), "/appeal.html?punishment=test");
  assert.equal(safeReturnTo("//evil.example"), "/");
  assert.equal(safeReturnTo("/api/private"), "/");
  assert.equal(safeReturnTo("https://evil.example"), "/");
  assert.equal(safeReturnTo("/competitions\\evil"), "/");
});

test("Discord OAuth callback returns the session cookie with its redirect", () => {
  const response = authenticatedRedirect(new URL("https://preview.example/api/callback"), {
    returnTo: "/competitions/",
    cookie: "__Host-test=session; Path=/; HttpOnly; Secure; SameSite=Lax"
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://preview.example/competitions/");
  assert.match(response.headers.get("set-cookie"), /__Host-test=session/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("Discord membership lookup distinguishes roleless members from non-members", async () => {
  const env = { DISCORD_GUILD_ID: ENV.DISCORD_GUILD_ID };
  let requestedUrl;
  const member = await fetchDiscordMembership("access-token", env, async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ roles: [] }), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal(requestedUrl, `https://discord.com/api/v10/users/@me/guilds/${ENV.DISCORD_GUILD_ID}/member`);
  assert.deepEqual(member, { member: true, roleIds: [] });

  const outsider = await fetchDiscordMembership("access-token", env, async () => new Response(null, { status: 404 }));
  assert.deepEqual(outsider, { member: false, roleIds: [] });
  assert.deepEqual(await fetchDiscordMembership("access-token", {}, async () => {
    throw new Error("must not fetch");
  }), { member: false, roleIds: [] });
});

test("Discord OAuth normalizes callback fields and role identifiers", () => {
  assert.equal(oauthCallbackValue("  callback-code  ", 32), "callback-code");
  assert.equal(oauthCallbackValue("", 32), null);
  assert.equal(oauthCallbackValue("x".repeat(33), 32), null);
  assert.equal(oauthCallbackValue(null, 32), null);
  assert.deepEqual(discordRoleIds({ roles: ["3".repeat(18), "bad-role"] }), ["3".repeat(18)]);
  assert.equal(discordRoleIds({ roles: "invalid" }), null);
});
