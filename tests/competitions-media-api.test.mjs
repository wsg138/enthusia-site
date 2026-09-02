import assert from "node:assert/strict";
import test from "node:test";

import {
  expectedVersion
} from "../functions/api/competitions/admin/[id]/media/index.js";
import { readLimitedBody, requestMimeType } from "../functions/lib/competitions/media-upload.js";
import { mediaId } from "../functions/api/competitions/media/[id].js";

function requestWithBody(body, headers = {}) {
  return new Request("https://preview.example/api/competitions/admin/test/media", {
    method: "POST",
    headers,
    body
  });
}

test("banner upload requires an explicit positive competition config version", () => {
  assert.equal(expectedVersion(new Request("https://example.test", {
    headers: { "x-competition-version": "4" }
  })), 4);
  assert.equal(expectedVersion(new Request("https://example.test")), null);
  assert.equal(expectedVersion(new Request("https://example.test", {
    headers: { "x-competition-version": "4.5" }
  })), null);
});

test("limited request reader returns the exact body and enforces the declared limit", async () => {
  const body = new Uint8Array([1, 2, 3, 4]);
  const result = await readLimitedBody(requestWithBody(body), 8);
  assert.deepEqual([...result], [...body]);

  await assert.rejects(
    () => readLimitedBody(requestWithBody(body, { "content-length": "100" }), 8),
    /image_too_large/
  );
});

test("image request MIME type ignores parameters and normalizes case", () => {
  const request = requestWithBody(new Uint8Array([1]), { "content-type": " Image/PNG; charset=binary " });
  assert.equal(requestMimeType(request), "image/png");
});

test("limited request reader stops a streamed body once it exceeds the cap", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3, 4]));
      controller.enqueue(new Uint8Array([5, 6, 7, 8]));
      controller.close();
    }
  });
  const request = new Request("https://preview.example/upload", {
    method: "POST",
    body: stream,
    duplex: "half"
  });
  await assert.rejects(() => readLimitedBody(request, 6), /image_too_large/);
});

test("public media route accepts canonical UUIDs only", () => {
  assert.equal(
    mediaId({ params: { id: "22222222-2222-4222-8222-222222222222" } }),
    "22222222-2222-4222-8222-222222222222"
  );
  assert.equal(mediaId({ params: { id: "../../secret" } }), null);
});
