import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStatusSnapshot,
  onRequestGet
} from "../functions/api/competitions/admin/status.js";

function responseJson(response) {
  return response.json();
}

function readyEnv() {
  return {
    APP_ENV: "preview",
    COMPETITIONS_ENABLED: "true",
    COMPETITIONS_DB: { prepare() {} },
    COMPETITIONS_MEDIA: { get() {} },
    OPENAI_API_KEY: "super-secret-value",
    COMPETITION_BRIDGE_ORIGIN: "https://bridge.example",
    COMPETITION_BRIDGE_BEARER_TOKEN: "b".repeat(32),
    COMPETITION_BRIDGE_HMAC_SECRET: "h".repeat(32),
    DISCORD_CLIENT_ID: "123456789012345678",
    DISCORD_CLIENT_SECRET: "d".repeat(32),
    DISCORD_OAUTH_REDIRECT_URI: "https://preview.example/api/competitions/auth/discord/callback",
    COMPETITIONS_DISCORD_STAFF_WEBHOOK: "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz123456",
    COMPETITIONS_DISCORD_STAFF_ROLE_ID: "234567890123456789",
    COMPETITIONS_SITE_ORIGIN: "https://preview.example"
  };
}

test("competition admin endpoint is hidden when the feature flag is absent", async () => {
  const response = await onRequestGet({
    env: {},
    request: new Request("https://preview.example/api/competitions/admin/status")
  });
  assert.equal(response.status, 404);
  assert.deepEqual(await responseJson(response), { error: "not_found" });
});

test("admin status snapshot exposes full readiness but never secret values", () => {
  const env = readyEnv();
  const snapshot = buildStatusSnapshot(env, true);
  assert.deepEqual(snapshot, {
    ok: true,
    environment: "preview",
    featureEnabled: true,
    database: { bound: true, schemaReady: true },
    media: { bound: true },
    moderation: { configured: true, model: "omni-moderation-latest" },
    identity: { discordOAuthConfigured: true },
    bridge: { configured: true },
    notifications: { minecraftConfigured: true, discordStaffConfigured: true },
    siteOrigin: { configured: true }
  });
  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes("super-secret-value"), false);
  assert.equal(serialized.includes(env.DISCORD_CLIENT_SECRET), false);
  assert.equal(serialized.includes(env.COMPETITIONS_DISCORD_STAFF_WEBHOOK), false);
});

test("admin status fails readiness when required integrations are missing", () => {
  const env = readyEnv();
  delete env.COMPETITIONS_DISCORD_STAFF_WEBHOOK;
  const snapshot = buildStatusSnapshot(env, true);
  assert.equal(snapshot.ok, false);
  assert.equal(snapshot.notifications.discordStaffConfigured, false);
});
