import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStatusSnapshot,
  onRequestGet
} from "../functions/api/competitions/admin/status.js";

function responseJson(response) {
  return response.json();
}

test("competition admin endpoint is hidden when the feature flag is absent", async () => {
  const response = await onRequestGet({
    env: {},
    request: new Request("https://preview.example/api/competitions/admin/status")
  });
  assert.equal(response.status, 404);
  assert.deepEqual(await responseJson(response), { error: "not_found" });
});

test("admin status snapshot exposes readiness but never secret values", () => {
  const env = {
    APP_ENV: "preview",
    COMPETITIONS_ENABLED: "true",
    COMPETITIONS_DB: { prepare() {} },
    COMPETITIONS_MEDIA: { get() {} },
    OPENAI_API_KEY: "super-secret-value"
  };

  const snapshot = buildStatusSnapshot(env, true);
  assert.deepEqual(snapshot, {
    ok: true,
    environment: "preview",
    featureEnabled: true,
    database: { bound: true, schemaReady: true },
    media: { bound: true },
    moderation: { configured: true, model: "omni-moderation-latest" }
  });
  assert.equal(JSON.stringify(snapshot).includes("super-secret-value"), false);
});
