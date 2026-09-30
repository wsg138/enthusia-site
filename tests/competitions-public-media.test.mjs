import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const mediaUrl = new URL("../public/assets/competitions-public-media.js", import.meta.url);
const detailUrl = new URL("../public/competitions/detail.html", import.meta.url);

test("competition detail uses the integrated entry viewer instead of duplicate media enhancement", async () => {
  const html = await readFile(detailUrl, "utf8");
  assert.doesNotMatch(html, /competitions-public-media\.js/);
  const detail = await readFile(new URL("../public/assets/competitions.js", import.meta.url), "utf8");
  assert.match(detail, /showEntryDialog/);
});

test("public media enhancement is valid JavaScript and uses approved submission-media URLs only", async () => {
  const result = spawnSync(process.execPath, ["--check", fileURLToPath(mediaUrl)], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const source = await readFile(mediaUrl, "utf8");
  assert.match(source, /startsWith\("\/api\/competitions\/submission-media\/"\)/);
  assert.match(source, /loading = "lazy"/);
  assert.match(source, /document\.createElement\("dialog"\)/);
  assert.match(source, /showModal/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /ArrowRight/);
});

test("results media enhancement maps published results back to exact submission IDs", async () => {
  const source = await readFile(mediaUrl, "utf8");
  assert.match(source, /submissions\.get\(result\.submissionId\)/);
  assert.match(source, /card\.dataset\.submissionId = submission\.id/);
});
