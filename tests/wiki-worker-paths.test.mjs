import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  PROJECT_ROOT,
  WIKI_OUTPUT_ROOT,
  containedFilename,
  projectInputPath,
  wikiOutputPath,
  wikiPageFilename
} from "../wiki-worker/project-paths.mjs";

test("wiki worker inputs remain inside the repository", () => {
  assert.equal(
    projectInputPath(undefined, "public/wiki-demo", "Wiki source"),
    path.join(PROJECT_ROOT, "public", "wiki-demo")
  );
  assert.throws(
    () => projectInputPath("../outside", "public/wiki-demo", "Wiki source"),
    /must stay inside/
  );
});

test("wiki render output remains below its dedicated output directory", () => {
  assert.equal(wikiOutputPath(), path.join(WIKI_OUTPUT_ROOT, "rendered"));
  assert.throws(() => wikiOutputPath("wiki-worker-output"), /must stay inside/);
  assert.throws(() => wikiOutputPath("public/wiki-demo"), /must stay inside/);
  assert.throws(() => wikiOutputPath("../outside"), /must stay inside/);
});

test("wiki filenames cannot introduce directory traversal", () => {
  const rendered = path.join(WIKI_OUTPUT_ROOT, "rendered");
  assert.equal(containedFilename(rendered, "mechanics.wiki"), path.join(rendered, "mechanics.wiki"));
  assert.throws(() => containedFilename(rendered, "../mechanics.wiki"), /single filename/);
  assert.throws(() => containedFilename(rendered, "nested/mechanics.wiki"), /single filename/);
  assert.equal(wikiPageFilename("history-lore"), "history-lore.wiki");
  assert.throws(() => wikiPageFilename("../history"), /page ID is invalid/);
});
