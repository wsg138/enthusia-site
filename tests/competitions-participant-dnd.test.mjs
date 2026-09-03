import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptUrl = new URL("../public/assets/competitions-participant-dnd.js", import.meta.url);
const detailUrl = new URL("../public/competitions/detail.html", import.meta.url);

test("competition detail loads the drag-drop screenshot helper", async () => {
  const html = await readFile(detailUrl, "utf8");
  assert.match(html, /competitions-participant-dnd\.js\?v=1/);
});

test("drag-drop helper remains valid JavaScript and delegates to the existing upload button", async () => {
  const result = spawnSync(process.execPath, ["--check", fileURLToPath(scriptUrl)], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const source = await readFile(scriptUrl, "utf8");
  assert.match(source, /input\.files = transfer\.files/);
  assert.match(source, /button\.click\(\)/);
  assert.match(source, /Use the arrows above to reorder screenshots/);
  assert.match(source, /Only PNG and JPEG screenshots/);
});
