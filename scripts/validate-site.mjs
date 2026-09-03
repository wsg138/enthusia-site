import { access, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";

const publicDir = path.join(process.cwd(), "public");
const errors = [];
const htmlScanSkipDirs = new Set(["assets", "banner-patterns"]);

async function findHtmlFiles(directory, relative = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      if (!htmlScanSkipDirs.has(entry.name)) {
        files.push(...await findHtmlFiles(path.join(directory, entry.name), relativePath));
      }
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".html")) files.push(relativePath);
  }
  return files;
}

const htmlFiles = await findHtmlFiles(publicDir);
const topLevelHtmlFiles = htmlFiles.filter((file) => path.dirname(file) === ".");

for (const file of htmlFiles) {
  const fullPath = path.join(publicDir, file);
  const html = await readFile(fullPath, "utf8");

  for (const required of ["<meta name=\"viewport\"", "<meta name=\"description\""]) {
    if (!html.includes(required)) errors.push(`${file}: missing ${required}`);
  }

  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map((match) => match[1]);
  for (const id of new Set(ids)) {
    if (ids.filter((candidate) => candidate === id).length > 1) errors.push(`${file}: duplicate id ${id}`);
  }

  for (const match of html.matchAll(/\s(?:href|src)=["']([^"']+)["']/g)) {
    const reference = match[1].split(/[?#]/, 1)[0];
    if (!reference || /^(?:https?:|mailto:|tel:|data:|\/\/)/.test(reference)) continue;
    const localPath = reference.startsWith("/")
      ? path.join(publicDir, reference.slice(1))
      : path.resolve(path.dirname(fullPath), reference);
    try {
      await access(localPath);
    } catch {
      errors.push(`${file}: missing local reference ${reference}`);
    }
  }
}

for (const file of [
  "appeal.html",
  "punishments.html",
  path.join("reviewer", "appeals.html"),
  path.join("competitions", "admin", "index.html"),
  path.join("competitions", "index.html"),
  path.join("competitions", "detail.html")
]) {
  const html = await readFile(path.join(publicDir, file), "utf8");
  const mainClass = html.match(/<main\b[^>]*\s+class\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
  if (!mainClass.split(/\s+/).includes("page-main")) {
    errors.push(`${file}: main content must use page-main to stay above the background layer`);
  }
}

for (const file of [
  path.join("reviewer", "appeals.html"),
  path.join("competitions", "admin", "index.html"),
  path.join("competitions", "index.html"),
  path.join("competitions", "detail.html")
]) {
  const html = await readFile(path.join(publicDir, file), "utf8");
  if (!html.includes('name="robots" content="noindex,nofollow,noarchive"')) {
    errors.push(`${file}: private and development pages must remain noindex`);
  }
}

const competitionRequiredAssets = [
  "competitions-admin.css",
  "competitions-admin-operations.css",
  "competitions-admin-workspace.css",
  "competitions-admin-tools.css",
  "competitions.css",
  "competitions-auth.css",
  "competitions-participant.css",
  "competitions-judge.css",
  "gallery-competitions.css",
  "site-account.js",
  "competitions-admin.js",
  "competitions-admin-media.js",
  "competitions-admin-workspace.js",
  "competitions-admin-tools.js",
  "competitions-admin-bootstrap.js",
  "competitions-admin-flags.js",
  "competitions.js",
  "competitions-auth.js",
  "competitions-identity-refresh.js",
  "competitions-participant-v2.js",
  "competitions-judge.js",
  "gallery-competitions.js"
];
for (const file of competitionRequiredAssets) {
  try {
    await access(path.join(publicDir, "assets", file));
  } catch {
    errors.push(`competitions: missing required asset ${file}`);
  }
}

const marketDir = path.join(publicDir, "assets", "market");
const marketRequired = [
  "market.js", "market-api-client.js", "market-owner-url.js", "market-adapter.js", "market-data.js", "market-layout.json", "sample-market-snapshot.json", "market.css",
  "map-core.js", "overview.png", "minecraft/material-icon-manifest.js", "minecraft/material-icon-manifest.json",
  "minecraft/font-metrics.js", "minecraft/font-metrics.json", "minecraft/item-catalog.js", "minecraft/item-catalog.json",
  "minecraft/public-item-policy.json", "minecraft/item-icon-validation-report.json", "minecraft/potion-variant-manifest.json",
  "minecraft/asset-source-manifest.json", "minecraft/vanilla/textures/gui/container/shulker_box.png",
  "minecraft/vanilla/textures/gui/sprites/container/slot.png", "minecraft/vanilla/textures/font/ascii.png"
];
for (const file of marketRequired) {
  try { await access(path.join(marketDir, file)); }
  catch { errors.push(`market: missing required asset ${file}`); }
}

const marketHtml = await readFile(path.join(publicDir, "market.html"), "utf8");
if (!marketHtml.includes('href="market.html" class="active" aria-current="page"')) errors.push("market.html: missing active Market navigation");
if (!marketHtml.includes("NOT AN OFFICIAL MINECRAFT PRODUCT")) errors.push("market.html: missing Minecraft product disclaimer");
const ownerUrlScript = marketHtml.indexOf("assets/market/market-owner-url.js");
const marketScript = marketHtml.indexOf("assets/market/market.js");
if (ownerUrlScript < 0 || marketScript < 0 || ownerUrlScript > marketScript) errors.push("market.html: owner URL helper must load before the Market viewer");
for (const file of topLevelHtmlFiles.filter(file => !["404.html", "celestial-test.html"].includes(file))) {
  const html = await readFile(path.join(publicDir, file), "utf8");
  if (!html.includes('href="market.html"')) errors.push(`${file}: missing Market navigation`);
}

const layout = JSON.parse(await readFile(path.join(marketDir, "market-layout.json"), "utf8"));
const number = value => Number(String(value).match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER);
const footprints = [...layout.buildings].sort((a, b) => number(a.id) - number(b.id) || a.id.localeCompare(b.id)).map(building => ({id: building.id, footprint: building.footprint}));
const fingerprint = createHash("sha256").update(JSON.stringify(footprints)).digest("hex");
if (layout.buildings.length !== 15 || layout.stalls.length !== 71) errors.push(`market: expected 15 buildings and 71 stalls, found ${layout.buildings.length}/${layout.stalls.length}`);
if (fingerprint !== "6f6d926c79fecbcf250043aab2445dccc94c60d92ff70bc042ac8b4650f5b2d8") errors.push(`market: polygon fingerprint mismatch ${fingerprint}`);
const catalog = JSON.parse(await readFile(path.join(marketDir, "minecraft", "item-catalog.json"), "utf8"));
if (catalog.items?.length !== 1487 || catalog.excludedCount !== 17) errors.push(`market: expected 1487 public Minecraft 1.21.11 catalog items and 17 exclusions, found ${catalog.items?.length ?? 0}/${catalog.excludedCount ?? 0}`);
const variants = JSON.parse(await readFile(path.join(marketDir, "minecraft", "item-variant-catalog.json"), "utf8"));
if (variants.items?.length !== 351) errors.push(`market: expected 351 Minecraft 1.21.11 variant entries, found ${variants.items?.length ?? 0}`);
if (variants.items?.some(item => item.kind === "ARMOR_TRIM_MATERIAL")) errors.push("market: pseudo armor-trim material variants must not be public search entries");
const potions = JSON.parse(await readFile(path.join(marketDir, "minecraft", "potion-variant-manifest.json"), "utf8"));
if (potions.items?.length !== 184 || potions.count !== 184) errors.push(`market: expected 184 audited potion variants, found ${potions.items?.length ?? 0}`);
for (const file of ["market.js", "market-api-client.js", "market-owner-url.js", "market-adapter.js", "market-data.js", "minecraft/material-icon-manifest.js", "minecraft/font-metrics.js", "minecraft/item-catalog.js", "minecraft/item-variant-catalog.js"]) {
  const result = spawnSync(process.execPath, ["--check", path.join(marketDir, file)], {encoding: "utf8"});
  if (result.status !== 0) errors.push(`market: invalid JavaScript ${file}: ${result.stderr.trim()}`);
}

const competitionJavaScript = competitionRequiredAssets.filter((file) => file.endsWith(".js"));
for (const file of competitionJavaScript) {
  const result = spawnSync(process.execPath, ["--check", path.join(publicDir, "assets", file)], { encoding: "utf8" });
  if (result.status !== 0) errors.push(`competitions: invalid JavaScript ${file}: ${result.stderr.trim()}`);
}

for (const file of ["appeals.js", "punishments.js", "reviewer-appeals.js", "site-account.js", "site-navigation.js"]) {
  const result = spawnSync(process.execPath, ["--check", path.join(publicDir, "assets", file)], { encoding: "utf8" });
  if (result.status !== 0) errors.push(`site: invalid JavaScript ${file}: ${result.stderr.trim()}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Validated ${htmlFiles.length} HTML pages and their local references.`);
}
