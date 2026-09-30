import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import test from "node:test";

async function javascriptFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await javascriptFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith(".js")) output.push(fullPath);
  }
  return output;
}

test("every competition library and API module imports successfully", async () => {
  const roots = [
    path.resolve("functions/lib/competitions"),
    path.resolve("functions/api/competitions")
  ];
  const files = (await Promise.all(roots.map(javascriptFiles))).flat().sort();
  assert.ok(files.length > 20);

  const failures = [];
  for (const file of files) {
    try {
      await import(`${pathToFileURL(file).href}?import-smoke=1`);
    } catch (error) {
      failures.push(`${path.relative(process.cwd(), file)}: ${error?.stack ?? error}`);
    }
  }
  assert.deepEqual(failures, []);
});
