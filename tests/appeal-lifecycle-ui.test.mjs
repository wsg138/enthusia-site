import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("player appeal page loads claim-aware lifecycle controls", () => {
  const page = read("public/appeal.html");
  const script = read("public/assets/appeals-lifecycle.js");
  assert.match(page, /appeals-lifecycle\.js\?v=1/);
  assert.match(script, /Edit appeal/);
  assert.match(script, /staff member has claimed this appeal/i);
  assert.match(script, /\/api\/appeals\/\$\{encodeURIComponent\(appeal\.id\)\}\/edit/);
  assert.match(script, /expectedVersion: Number\(appeal\.version\)/);
  assert.match(script, /crypto\.randomUUID\(\)/);
});

test("reviewer appeal page requires claim before decisions and exposes senior reopen", () => {
  const page = read("public/reviewer/appeals.html");
  const script = read("public/assets/reviewer-appeals-lifecycle.js");
  assert.match(page, /reviewer-appeals-lifecycle\.js\?v=1/);
  assert.match(script, /Claim appeal/);
  assert.match(script, /Reopen appeal/);
  assert.match(script, /decision\.hidden = true/);
  assert.match(script, /decision\.hidden = false/);
  assert.match(script, /\/api\/reviewer\/appeals\/\$\{encodeURIComponent\(appeal\.id\)\}\/\$\{action\}/);
});

test("lifecycle decorators use versioned signatures to avoid mutation observer loops", () => {
  const player = read("public/assets/appeals-lifecycle.js");
  const reviewer = read("public/assets/reviewer-appeals-lifecycle.js");
  assert.match(player, /dataset\.lifecycleSignature/);
  assert.match(reviewer, /dataset\.lifecycleSignature/);
});
