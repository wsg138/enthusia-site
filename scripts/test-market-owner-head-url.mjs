import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("public/assets/market/market.js", "utf8");
const match = source.match(/  const headUrlPattern =[^\n]+;\n  function ownerHeadUrl\(owner\) \{[\s\S]*?\n  \}/);
assert.ok(match, "ownerHeadUrl implementation was not found");
const ownerHeadUrl = Function("assetBase", `${match[0]}\nreturn ownerHeadUrl;`)("assets/market/");

const absoluteUrl = "https://minotar.net/helm/55306c12-a187-4160-b9da-91798c84492c/96.png";
assert.equal(ownerHeadUrl({ avatarUrl: absoluteUrl, type: "PLAYER" }), absoluteUrl);
assert.equal(ownerHeadUrl({ avatarUrl: "player-head-java.svg", type: "PLAYER" }), "assets/market/player-head-java.svg");
console.log("Verified absolute Minotar URLs remain absolute and local fallbacks use the Market asset base.");
