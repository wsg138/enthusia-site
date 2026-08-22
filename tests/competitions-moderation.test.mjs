import assert from "node:assert/strict";
import test from "node:test";

import {
  moderateImageDataUrl,
  moderateText,
  moderationAllowsPublication,
  moderationModel
} from "../functions/lib/competitions/moderation.js";

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("moderation is locked to the free omni moderation model family", () => {
  assert.equal(moderationModel({}), "omni-moderation-latest");
  assert.equal(
    moderationModel({ OPENAI_MODERATION_MODEL: "omni-moderation-2024-09-26" }),
    "omni-moderation-2024-09-26"
  );
  assert.equal(
    moderationModel({ OPENAI_MODERATION_MODEL: "gpt-5.6" }),
    "omni-moderation-latest"
  );
});

test("text moderation sends the expected request and passes clean content", async () => {
  let captured;
  const result = await moderateText(
    "A normal Minecraft build description",
    { OPENAI_API_KEY: "secret" },
    async (url, init) => {
      captured = { url, init, body: JSON.parse(init.body) };
      return jsonResponse(200, {
        model: "omni-moderation-latest",
        results: [{
          flagged: false,
          categories: { violence: false },
          category_scores: { violence: 0.001 },
          category_applied_input_types: { violence: ["text"] }
        }]
      });
    }
  );

  assert.equal(captured.url, "https://api.openai.com/v1/moderations");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers.authorization, "Bearer secret");
  assert.deepEqual(captured.body.input, [
    { type: "text", text: "A normal Minecraft build description" }
  ]);
  assert.equal(result.outcome, "PASSED");
  assert.equal(moderationAllowsPublication(result), true);
});

test("flagged moderation content is blocked", async () => {
  const result = await moderateText(
    "unsafe",
    { OPENAI_API_KEY: "secret" },
    async () => jsonResponse(200, {
      model: "omni-moderation-latest",
      results: [{
        flagged: true,
        categories: { violence: true },
        category_scores: { violence: 0.98 },
        category_applied_input_types: { violence: ["text"] }
      }]
    })
  );

  assert.equal(result.outcome, "BLOCKED");
  assert.equal(moderationAllowsPublication(result), false);
});

test("moderation failure fails closed instead of approving content", async () => {
  const unconfigured = await moderateText("hello", {}, async () => {
    throw new Error("should not be called");
  });
  assert.equal(unconfigured.outcome, "ERROR");
  assert.equal(unconfigured.error, "not_configured");
  assert.equal(moderationAllowsPublication(unconfigured), false);

  const unavailable = await moderateText(
    "hello",
    { OPENAI_API_KEY: "secret" },
    async () => jsonResponse(503, { error: "unavailable" })
  );
  assert.equal(unavailable.outcome, "ERROR");
  assert.equal(unavailable.error, "http_503");
  assert.equal(moderationAllowsPublication(unavailable), false);
});

test("image moderation accepts supported data URLs and rejects other inputs", async () => {
  let body;
  const result = await moderateImageDataUrl(
    "data:image/png;base64,aGVsbG8=",
    { OPENAI_API_KEY: "secret" },
    async (_url, init) => {
      body = JSON.parse(init.body);
      return jsonResponse(200, {
        model: "omni-moderation-latest",
        results: [{
          flagged: false,
          categories: { sexual: false },
          category_scores: { sexual: 0.002 },
          category_applied_input_types: { sexual: ["image"] }
        }]
      });
    }
  );

  assert.deepEqual(body.input, [{
    type: "image_url",
    image_url: { url: "data:image/png;base64,aGVsbG8=" }
  }]);
  assert.equal(result.outcome, "PASSED");

  await assert.rejects(
    () => moderateImageDataUrl("https://example.com/image.png", {}, async () => null),
    /supported image data URL/
  );
});
