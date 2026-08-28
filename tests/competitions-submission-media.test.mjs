import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { nextSubmissionImageSortOrder } from "../functions/lib/competitions/submission-media.js";

test("new submission images use the next free position after the highest active image", () => {
  assert.equal(nextSubmissionImageSortOrder([]), 0);
  assert.equal(nextSubmissionImageSortOrder([
    { sortOrder: 0 },
    { sortOrder: 2 }
  ]), 3);
});

test("submission image position calculation rejects corrupt stored positions", () => {
  assert.throws(() => nextSubmissionImageSortOrder([{ sortOrder: -1 }]), /sort order is invalid/);
  assert.throws(() => nextSubmissionImageSortOrder([{ sortOrder: 1.5 }]), /sort order is invalid/);
});

test("player and staff upload routes calculate an explicit image position", async () => {
  const sources = await Promise.all([
    readFile(new URL("../functions/api/competitions/[slug]/submissions/[id]/images/index.js", import.meta.url), "utf8"),
    readFile(new URL("../functions/api/competitions/admin/[id]/submissions/[submissionId]/images/index.js", import.meta.url), "utf8")
  ]);
  for (const source of sources) {
    assert.match(source, /nextSubmissionImageSortOrder\(images\)/);
    assert.doesNotMatch(source, /existing\.length/);
  }
});
