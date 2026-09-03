import assert from "node:assert/strict";
import test from "node:test";
import {
  appealAttachmentKey,
  appealAttachmentLimits,
  cleanupAppealAttachment,
  deleteAppealAttachment,
  inspectAppealAttachment,
  safeAttachmentName,
  storeAppealAttachment
} from "../functions/lib/appeal-attachments.js";
import {
  appealAttachmentDisposition,
  appealAttachmentResponse
} from "../functions/lib/appeal-attachment-response.js";

const DRAFT_ID = "11111111-1111-4111-8111-111111111111";
const ATTACHMENT_ID = "22222222-2222-4222-8222-222222222222";

function u32(value) {
  return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}

function bytes(...parts) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function chunk(type, body = new Uint8Array()) {
  return bytes(u32(body.length), new TextEncoder().encode(type), body, new Uint8Array(4));
}

function png(metadata = false) {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = bytes(u32(1280), u32(720), new Uint8Array([8, 2, 0, 0, 0]));
  return bytes(
    signature,
    chunk("IHDR", header),
    ...(metadata ? [chunk("tEXt", new TextEncoder().encode("GPS=private"))] : []),
    chunk("IDAT", new Uint8Array([1, 2, 3])),
    chunk("IEND")
  );
}

test("appeal evidence accepts clean screenshots and UTF-8 text only", () => {
  const image = inspectAppealAttachment(png(), "image/png", "screen.png");
  assert.equal(image.ok, true);
  assert.equal(image.width, 1280);
  assert.deepEqual(
    inspectAppealAttachment(png(true), "image/png", "screen.png"),
    { ok: false, error: "image_metadata_not_stripped" }
  );

  const log = inspectAppealAttachment(new TextEncoder().encode("[12:00] complete chat log\n"), "text/plain", "chat.log");
  assert.equal(log.ok, true);
  assert.equal(log.mimeType, "text/plain");
  assert.equal(inspectAppealAttachment(new Uint8Array([0, 1, 2]), "text/plain", "bad.txt").ok, false);
});

test("attachment names and storage keys cannot escape the private appeal scope", () => {
  assert.equal(safeAttachmentName("../../private/chat.log"), "chat.log");
  assert.equal(appealAttachmentKey(DRAFT_ID, ATTACHMENT_ID, "png"), `appeals/${DRAFT_ID}/${ATTACHMENT_ID}.png`);
  assert.throws(() => appealAttachmentKey(DRAFT_ID, ATTACHMENT_ID, "html"), /extension/);
});

test("appeal evidence is stored with private metadata and controlled keys", async () => {
  const calls = [];
  const bucket = {
    async put(key, data, options) {
      calls.push({ key, data, options });
      return { size: data.byteLength };
    }
  };
  const data = png();
  const inspection = inspectAppealAttachment(data, "image/png", "screen.png");
  const stored = await storeAppealAttachment(bucket, { data, draftId: DRAFT_ID, attachmentId: ATTACHMENT_ID, inspection });
  assert.equal(calls[0].key, `appeals/${DRAFT_ID}/${ATTACHMENT_ID}.png`);
  assert.equal(calls[0].options.httpMetadata.cacheControl, "private, no-store");
  assert.equal(calls[0].options.customMetadata.purpose, "appeal-evidence");
  assert.match(stored.sha256, /^[0-9a-f]{64}$/);
});

test("appeal evidence deletion rejects objects outside the appeal scope", async () => {
  const deleted = [];
  const bucket = { async delete(key) { deleted.push(key); } };
  const key = `appeals/${DRAFT_ID}/${ATTACHMENT_ID}.txt`;
  await deleteAppealAttachment(bucket, key);
  assert.deepEqual(deleted, [key]);
  await assert.rejects(() => deleteAppealAttachment(bucket, "gallery/private.png"), /key is invalid/);
  assert.equal(appealAttachmentLimits().maxAttachments, 5);
});

test("appeal evidence cleanup retries a transient storage failure", async () => {
  const pending = [];
  let attempts = 0;
  const context = { waitUntil(promise) { pending.push(promise); } };
  const bucket = {
    async delete() {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary R2 failure");
    }
  };
  const key = `appeals/${DRAFT_ID}/${ATTACHMENT_ID}.txt`;

  await cleanupAppealAttachment(context, bucket, key);
  await Promise.all(pending);

  assert.equal(attempts, 2);
  assert.equal(pending.length, 1);
});

test("appeal evidence responses use safe private download headers", async () => {
  const record = {
    displayName: "chat (complete).log",
    mimeType: "text/plain",
    byteSize: 12
  };
  assert.equal(
    appealAttachmentDisposition(record),
    "attachment; filename*=UTF-8''chat%20%28complete%29.log"
  );

  const response = appealAttachmentResponse({ body: "chat content" }, record);
  assert.equal(response.headers.get("content-type"), "text/plain");
  assert.equal(response.headers.get("content-length"), "12");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-security-policy"), /default-src 'none'/);
  assert.equal(await response.text(), "chat content");
});

test("appeal screenshots open inline without weakening private headers", () => {
  assert.equal(appealAttachmentDisposition({
    displayName: "proof.png",
    mimeType: "image/png"
  }), "inline; filename*=UTF-8''proof.png");
});
