import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const rendererPath = resolve("public/assets/guild-banner-renderer.js");
const renderer = await readFile(rendererPath, "utf8");
const section = name => {
  const match = renderer.match(new RegExp(`const ${name} = Object\\.freeze\\(\\{([\\s\\S]*?)\\n  \\}\\);`));
  assert.ok(match, `${name} definition was not found`);
  return match[1];
};
const assetEntries = source => [...source.matchAll(/([A-Z_]+):\s*"([a-z_]+)"/g)];
const aliasEntries = source => [...source.matchAll(/([A-Z_]+):\s*"([A-Z_]+)"/g)];
const assets = new Map(assetEntries(section("ASSETS")).map(([, key, file]) => [key, file]));
const aliases = new Map(aliasEntries(section("ALIASES")).map(([, key, target]) => [key, target]));

assert.ok(assets.size > 0, "renderer must define banner assets");
for (const [alias, target] of aliases) assert.ok(assets.has(target) || target === "BASE", `alias ${alias} has no asset target`);

const files = new Set(["base", ...assets.values()]);
const assetDirectory = resolve(process.argv[2] || "public/banner-patterns");
for (const file of files) await access(resolve(assetDirectory, `${file}.png`));

console.log(`Verified ${files.size} renderer banner masks and ${aliases.size} alias targets in ${assetDirectory}.`);
