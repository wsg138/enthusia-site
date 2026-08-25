import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("navigation keeps Appeals top-level and Punishments in Community", async () => {
  const source = await readFile(new URL("../public/assets/site-navigation.js", import.meta.url), "utf8");
  assert.match(source, /internalLink\(nav, "\/appeal\.html", "Appeals"\)/);
  assert.match(source, /internalLink\(nav, "\/punishments\.html", "Punishments"\)/);
  assert.match(source, /nav\.insertBefore\(appeal, dropdown\)/);
  assert.match(source, /menu\.insertBefore\(punishments, wiki \?\? null\)/);
  assert.match(source, /menu\.insertBefore\(market, wiki \?\? null\)/);
  assert.match(source, /menu\.insertBefore\(competition, wiki \?\? null\)/);
});

test("navigation applies one consistent active state to the current page and its section", async () => {
  const source = await readFile(new URL("../public/assets/site-navigation.js", import.meta.url), "utf8");
  assert.match(source, /activeLink\.classList\.add\("active"\)/);
  assert.match(source, /trigger\.classList\.toggle\("active", hasActiveCommunityLink\)/);
  assert.match(source, /menu\.querySelector\("a\.active"\)/);
});
