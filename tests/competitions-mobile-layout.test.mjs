import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("competition detail removes mobile min-content overflow", async () => {
  const css = await readFile(new URL("../public/assets/competitions.css", import.meta.url), "utf8");
  assert.match(css, /\.competition-detail-shell\{min-width:0;overflow:hidden\}/);
  assert.match(css, /\.competition-tab-panel>\*\{min-width:0\}/);
  assert.match(css, /\.competition-full-details>summary\{display:block;width:auto/);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*\.competitions-main\{width:100%;min-width:0/);
  assert.match(css, /\.competition-guide-callout \.competition-primary-action\{width:100%/);
});
