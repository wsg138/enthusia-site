import assert from "node:assert/strict";
import test from "node:test";

import {
  competitionMediaKey,
  deleteCompetitionImage,
  prepareCompetitionImage,
  storePreparedCompetitionImage
} from "../functions/lib/competitions/media-storage.js";

const COMPETITION_ID = "11111111-1111-4111-8111-111111111111";
const MEDIA_ID = "22222222-2222-4222-8222-222222222222";

function u32(value) {
  return new Uint8Array([
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255
  ]);
}

function join(...parts) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function chunk(type, body = new Uint8Array()) {
  return join(u32(body.length), new TextEncoder().encode(type), body, new Uint8Array(4));
}

function cleanPng() {
  const header = join(u32(1280), u32(720), new Uint8Array([8, 2, 0, 0, 0]));
  return join(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array([1, 2, 3])),
    chunk("IEND")
  );
}

function moderationResponse(flagged = false, status = 200) {
  return async () => new Response(JSON.stringify({
    model: "omni-moderation-latest",
    results: [{
      flagged,
      categories: { violence: flagged },
      category_scores: { violence: flagged ? 0.99 : 0.001 },
      category_applied_input_types: { violence: ["image"] }
    }]
  }), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("competition media keys are private scoped paths with no player filename", () => {
  assert.equal(
    competitionMediaKey({ competitionId: COMPETITION_ID, mediaId: MEDIA_ID, extension: "png" }),
    `competitions/${COMPETITION_ID}/submission/${MEDIA_ID}.png`
  );
  assert.throws(() => competitionMediaKey({ competitionId: "bad", mediaId: MEDIA_ID, extension: "png" }));
  assert.throws(() => competitionMediaKey({ competitionId: COMPETITION_ID, mediaId: MEDIA_ID, extension: "webp" }));
});

test("clean image must pass free OpenAI moderation before becoming store-ready", async () => {
  const result = await prepareCompetitionImage({
    data: cleanPng(),
    competitionId: COMPETITION_ID,
    mediaId: MEDIA_ID,
    env: { OPENAI_API_KEY: "test-key" },
    fetchImpl: moderationResponse(false)
  });

  assert.equal(result.status, "READY");
  assert.equal(result.inspection.mimeType, "image/png");
  assert.equal(result.inspection.width, 1280);
  assert.equal(result.moderation.outcome, "PASSED");
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
});

test("flagged or unavailable moderation never produces a storable image", async () => {
  const blocked = await prepareCompetitionImage({
    data: cleanPng(),
    competitionId: COMPETITION_ID,
    mediaId: MEDIA_ID,
    env: { OPENAI_API_KEY: "test-key" },
    fetchImpl: moderationResponse(true)
  });
  assert.equal(blocked.status, "BLOCKED");
  assert.equal("data" in blocked, false);
  assert.equal("key" in blocked, false);

  const unavailable = await prepareCompetitionImage({
    data: cleanPng(),
    competitionId: COMPETITION_ID,
    mediaId: MEDIA_ID,
    env: {},
    fetchImpl: moderationResponse(false)
  });
  assert.equal(unavailable.status, "ERROR");
  assert.equal(unavailable.moderation.error, "not_configured");
  assert.equal("data" in unavailable, false);
});

test("prepared image is written to private R2 with controlled metadata", async () => {
  const prepared = await prepareCompetitionImage({
    data: cleanPng(),
    competitionId: COMPETITION_ID,
    mediaId: MEDIA_ID,
    purpose: "banner",
    env: { OPENAI_API_KEY: "test-key" },
    fetchImpl: moderationResponse(false)
  });

  const calls = [];
  const bucket = {
    async put(key, data, options) {
      calls.push({ key, data, options });
      return { etag: "etag-1", size: data.byteLength };
    }
  };
  const stored = await storePreparedCompetitionImage(bucket, prepared);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].key, `competitions/${COMPETITION_ID}/banner/${MEDIA_ID}.png`);
  assert.equal(calls[0].options.httpMetadata.contentType, "image/png");
  assert.equal(calls[0].options.httpMetadata.cacheControl, "private, no-store");
  assert.equal(calls[0].options.customMetadata.moderationOutcome, "PASSED");
  assert.equal(stored.etag, "etag-1");
});

test("competition media deletion only accepts scoped generated keys", async () => {
  const deleted = [];
  const bucket = { async delete(key) { deleted.push(key); } };
  const key = `competitions/${COMPETITION_ID}/gallery/${MEDIA_ID}.jpg`;
  await deleteCompetitionImage(bucket, key);
  assert.deepEqual(deleted, [key]);
  await assert.rejects(() => deleteCompetitionImage(bucket, "../../other-object"));
});
