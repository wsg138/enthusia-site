import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("community navigation places Market and Competitions immediately before Wiki", async () => {
  const source = await readFile(new URL("../public/assets/site-account.js", import.meta.url), "utf8");
  assert.match(source, /normalizeCommunityLinks/);
  assert.match(source, /a\[href\$="market\.html"\]/);
  assert.match(source, /menu\.insertBefore\(market, wiki \?\? null\)/);
  assert.match(source, /menu\.insertBefore\(competition, wiki \?\? null\)/);
  assert.doesNotMatch(source, /menu\.prepend\(link\)/);
});
