import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("appeal page asks separate detailed questions without transitional linking copy", async () => {
  const html = await readFile(new URL("../public/appeal.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /moderation-assurances|No Minecraft link|linking is being added/i);
  assert.match(html, /id="appeal-what-happened"[^>]*minlength="100"/);
  assert.match(html, /id="appeal-why-review"[^>]*minlength="100"/);
  assert.match(html, /id="appeal-future-steps"[^>]*minlength="75"/);
  assert.match(html, /Short or incomplete answers cannot be submitted/);
});

test("staff appeal workspace is private and uses its maintained script", async () => {
  const html = await readFile(new URL("../public/reviewer/appeals.html", import.meta.url), "utf8");
  assert.match(html, /name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(html, /src="\.\.\/assets\/reviewer-appeals\.js\?v=1"/);
  assert.doesNotMatch(html, /<script type="module">/);
});
