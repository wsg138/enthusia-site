import assert from "node:assert/strict";
import test from "node:test";

import {
  competitionImageLimits,
  inspectCompetitionImage,
  sha256Hex
} from "../functions/lib/competitions/media-policy.js";

function u32(value) {
  return new Uint8Array([
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255
  ]);
}

function bytes(...parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function pngChunk(type, body = new Uint8Array()) {
  const typeBytes = new TextEncoder().encode(type);
  return bytes(u32(body.length), typeBytes, body, new Uint8Array(4));
}

function png({ metadata = false } = {}) {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = bytes(
    u32(1920),
    u32(1080),
    new Uint8Array([8, 2, 0, 0, 0])
  );
  const parts = [signature, pngChunk("IHDR", header)];
  if (metadata) parts.push(pngChunk("tEXt", new TextEncoder().encode("GPS=secret")));
  parts.push(pngChunk("IDAT", new Uint8Array([1, 2, 3])), pngChunk("IEND"));
  return bytes(...parts);
}

function jpeg({ metadata = false } = {}) {
  const soi = new Uint8Array([0xff, 0xd8]);
  const app0 = new Uint8Array([0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46]);
  const app1 = new Uint8Array([0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66]);
  const sof0 = new Uint8Array([
    0xff, 0xc0,
    0x00, 0x0b,
    0x08,
    0x04, 0x38,
    0x07, 0x80,
    0x01, 0x01, 0x11, 0x00
  ]);
  const sos = new Uint8Array([
    0xff, 0xda,
    0x00, 0x08,
    0x01, 0x01, 0x00, 0x00, 0x3f, 0x00
  ]);
  const scan = new Uint8Array([0x11, 0x22, 0x33, 0xff, 0xd9]);
  return bytes(soi, app0, ...(metadata ? [app1] : []), sof0, sos, scan);
}

test("competition image policy accepts clean PNG screenshots and reads dimensions", () => {
  const result = inspectCompetitionImage(png());
  assert.equal(result.ok, true);
  assert.equal(result.mimeType, "image/png");
  assert.equal(result.width, 1920);
  assert.equal(result.height, 1080);
});

test("competition image policy rejects PNG metadata chunks", () => {
  assert.deepEqual(
    inspectCompetitionImage(png({ metadata: true })),
    { ok: false, error: "image_metadata_not_stripped" }
  );
});

test("competition image policy accepts baseline JPEG and rejects EXIF metadata", () => {
  const clean = inspectCompetitionImage(jpeg());
  assert.equal(clean.ok, true);
  assert.equal(clean.mimeType, "image/jpeg");
  assert.equal(clean.width, 1920);
  assert.equal(clean.height, 1080);

  assert.deepEqual(
    inspectCompetitionImage(jpeg({ metadata: true })),
    { ok: false, error: "image_metadata_not_stripped" }
  );
});

test("competition image policy rejects unsupported bytes and oversized input", () => {
  assert.deepEqual(
    inspectCompetitionImage(new Uint8Array([1, 2, 3])),
    { ok: false, error: "unsupported_or_invalid_image" }
  );

  const limit = competitionImageLimits().maxBytes;
  assert.deepEqual(
    inspectCompetitionImage(new Uint8Array(limit + 1)),
    { ok: false, error: "image_too_large" }
  );
});

test("competition image hashes are stable SHA-256 hex", async () => {
  assert.equal(
    await sha256Hex(new TextEncoder().encode("enthusia")),
    "c12c3deebd6ed8f19e293ac03d179956ee796c44043147f3f51efceefc770269"
  );
});
