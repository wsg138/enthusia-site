import assert from "node:assert/strict";
import test from "node:test";

import {
  beginDiscordOAuth,
  discordOAuthConfiguration,
  discordOAuthConfigured
} from "../functions/lib/competitions/discord-oauth.js";

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
  DISCORD_CLIENT_ID: "123456789012345678",
  DISCORD_CLIENT_SECRET: "0123456789abcdef0123456789abcdef",
  DISCORD_OAUTH_REDIRECT_URI: "https://competitions-dev.example.com/api/competitions/auth/discord/callback"
};

test("Discord competition OAuth uses identify and allows interactive first-time authorization", async () => {
  const oauth = await beginDiscordOAuth(writeOnlyDb(), ENV, "/competitions/detail.html?competition=test");
  const url = new URL(oauth.url);
  assert.equal(url.origin, "https://discord.com");
  assert.equal(url.pathname, "/oauth2/authorize");
  assert.equal(url.searchParams.get("client_id"), ENV.DISCORD_CLIENT_ID);
  assert.equal(url.searchParams.get("scope"), "identify");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("redirect_uri"), ENV.DISCORD_OAUTH_REDIRECT_URI);
  assert.ok(url.searchParams.get("state"));
  assert.equal(url.searchParams.has("prompt"), false);
});

test("Discord OAuth configuration fails closed for missing secret or insecure redirect", () => {
  assert.equal(discordOAuthConfigured(ENV), true);
  assert.throws(() => discordOAuthConfiguration({ ...ENV, DISCORD_CLIENT_SECRET: "" }), /not configured/);
  assert.throws(() => discordOAuthConfiguration({ ...ENV, DISCORD_OAUTH_REDIRECT_URI: "http://example.com/callback" }), /HTTPS/);
});
