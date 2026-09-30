import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

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

  for (const pattern of [
    ".dev.vars",
    ".dev.vars.*",
    ".env",
    ".env.*",
    "cloudflare/competition-jobs/wrangler.dev.jsonc",
    "cloudflare/competition-preview/wrangler.dev.jsonc"
  ]) {
    assert.ok(ignored.has(pattern), `.gitignore must contain ${pattern}`);
  }
});

test("home carousel matches the maintained staff roster", async () => {
  const [configSource, staffPage] = await Promise.all([
    read("public/assets/site-config.js"),
    read("public/staff.html")
  ]);
  const context = { window: {} };
  vm.runInNewContext(configSource, context);

  const pageRoster = Array.from(
    staffPage.matchAll(
      /<span class="staff-role [^"]+">([^<]+)<\/span>[\s\S]*?<dt>Minecraft<\/dt><dd>([^<]+)<\/dd>/g
    ),
    ([, role, username]) => ({ username, role })
  );
  const carouselRoster = Array.from(
    context.window.ENTHUSIA.home.staff,
    ({ username, role }) => ({ username, role })
  );

  assert.deepEqual(carouselRoster, pageRoster);
});
