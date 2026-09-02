import assert from "node:assert/strict";
import test from "node:test";

import {
  imageBodyFailureResponse,
  preparedImageFailureResponse
} from "../functions/api/competitions/[slug]/submissions/[id]/images/index.js";

test("submission image body errors preserve request-size status", async () => {
  const tooLarge = imageBodyFailureResponse(new Error("image_too_large"));
  assert.equal(tooLarge.status, 413);
  assert.deepEqual(await tooLarge.json(), { error: "image_too_large" });

  const invalid = imageBodyFailureResponse(new Error("image_empty"));
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "image_empty" });
});

test("submission image moderation results fail closed with stable statuses", async () => {
  const rejected = preparedImageFailureResponse({ status: "REJECTED", error: "invalid_png" });
  assert.equal(rejected.status, 400);
  assert.deepEqual(await rejected.json(), { error: "invalid_png" });

  const blocked = preparedImageFailureResponse({ status: "BLOCKED" });
  assert.equal(blocked.status, 422);
  assert.deepEqual(await blocked.json(), { error: "image_blocked_by_moderation" });

  const unavailable = preparedImageFailureResponse({ status: "ERROR" });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: "image_moderation_unavailable" });
  assert.equal(preparedImageFailureResponse({ status: "READY" }), null);
});
