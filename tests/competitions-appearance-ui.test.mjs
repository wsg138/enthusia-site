import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicScriptUrl = new URL("../public/assets/competitions-appearance.js", import.meta.url);
const adminScriptUrl = new URL("../public/assets/competitions-admin-media.js", import.meta.url);
const catalogHtml = await readFile(new URL("../public/competitions/index.html", import.meta.url), "utf8");
const detailHtml = await readFile(new URL("../public/competitions/detail.html", import.meta.url), "utf8");
const publicSource = await readFile(publicScriptUrl, "utf8");
const adminSource = await readFile(adminScriptUrl, "utf8");

function syntaxCheck(url) {
  const result = spawnSync(process.execPath, ["--check", url.pathname], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("competition appearance browser modules remain valid JavaScript", () => {
  syntaxCheck(publicScriptUrl);
  syntaxCheck(adminScriptUrl);
});

test("catalog and detail load the appearance enhancer and stylesheet", () => {
  for (const html of [catalogHtml, detailHtml]) {
    assert.match(html, /competitions-appearance\.css/);
    assert.match(html, /competitions-appearance\.js/);
  }
});

test("public appearance enhancer only reads media through competition API routes", () => {
  assert.match(publicSource, /\/api\/competitions/);
  assert.match(publicSource, /\/media\//);
  assert.doesNotMatch(publicSource, /r2\.|storageKey|COMPETITIONS_MEDIA/);
});

test("admin appearance uploader sends explicit typed media purpose", () => {
  assert.match(adminSource, /x-competition-media-purpose/);
  assert.match(adminSource, /purpose: "icon"/);
  assert.match(adminSource, /purpose: "category"/);
  assert.match(adminSource, /configField: "iconImageId"/);
  assert.match(adminSource, /configField: "categoryImageId"/);
});
