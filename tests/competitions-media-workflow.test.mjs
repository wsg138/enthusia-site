import assert from "node:assert/strict";
import test from "node:test";

import { privateStoredImageResponse } from "../functions/lib/competitions/media-workflow.js";

const image = {
  storageKey: "competitions/entry/image.png",
  mimeType: "image/png"
};

test("private competition media uses defensive response headers", async () => {
  const response = await privateStoredImageResponse({
    async get(key) {
      assert.equal(key, image.storageKey);
      return { body: new Uint8Array([1, 2, 3]), httpEtag: '"etag"' };
    }
  }, image);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("etag"), '"etag"');
});

test("private competition media returns stable missing and unavailable responses", async () => {
  const missing = await privateStoredImageResponse({ async get() { return null; } }, image);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "image_not_found" });

  const unavailable = await privateStoredImageResponse({ async get() { throw new Error("offline"); } }, image);
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: "competition_media_unavailable" });
});
