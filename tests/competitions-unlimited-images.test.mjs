import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("competition entries have no screenshot-count ceiling", async () => {
  const [uploadApi, submissionApi, participantUi, publicProjection] = await Promise.all([
    read("../functions/api/competitions/[slug]/submissions/[id]/images/index.js"),
    read("../functions/api/competitions/[slug]/submissions/[id].js"),
    read("../public/assets/competitions-participant-v2.js"),
    read("../functions/lib/competitions/public.js")
  ]);
  assert.doesNotMatch(uploadApi, /existing\.length\s*>=\s*competition\.config\.entries\.maxImages/);
  assert.doesNotMatch(submissionApi, /images\.length\s*>\s*competition\.config\.entries\.maxImages/);
  assert.doesNotMatch(participantUi, /images\.length\s*<\s*limits\.maxImages/);
  assert.doesNotMatch(publicProjection, /maxImages:/);
});

test("public guide explains screenshot requirements and the per-file safety limit", async () => {
  const guide = await read("../public/competitions/guide.html");
  assert.match(guide, /There is no screenshot-count limit/);
  assert.match(guide, /no larger than 8 MB/);
});
