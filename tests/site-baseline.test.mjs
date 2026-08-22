import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("retired Northstar route has no live configuration references", async () => {
  const files = [
    "public/robots.txt",
    "public/_headers",
    "scripts/build.mjs"
  ];

  for (const file of files) {
    const content = await read(file);
    assert.equal(
      content.includes("northstar-a7k3m9"),
      false,
      `${file} must not retain the retired Northstar route`
    );
  }
});

test("local Cloudflare and API secret files are ignored", async () => {
  const gitignore = await read(".gitignore");
  const ignored = new Set(
    gitignore
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );

  for (const pattern of [".dev.vars", ".dev.vars.*", ".env", ".env.*"]) {
    assert.ok(ignored.has(pattern), `.gitignore must contain ${pattern}`);
  }
});
