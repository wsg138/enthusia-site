import assert from "node:assert/strict";
import test from "node:test";

import {
  onRequestGet,
  onRequestPost
} from "../functions/api/competitions/admin/index.js";

test("competition admin collection is hidden while the feature is disabled", async () => {
  const response = await onRequestGet({
    env: {},
    request: new Request("https://preview.example/api/competitions/admin")
  });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not_found" });
});

test("competition draft creation rejects requests without same-origin proof before auth", async () => {
  const response = await onRequestPost({
    env: { COMPETITIONS_ENABLED: "true" },
    request: new Request("https://preview.example/api/competitions/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Summer Build", category: "Build" })
    })
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "invalid_origin" });
});
