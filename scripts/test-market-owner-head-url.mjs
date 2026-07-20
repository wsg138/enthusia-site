import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("public/assets/market/market.js", "utf8");
const match = source.match(/  const minotarHeadUrlPattern =[^\n]+;\n  const capturedHeadUrlPattern =[^\n]+;\n  function ownerHeadUrl\(owner\) \{[\s\S]*?\n  \}/);
assert.ok(match, "ownerHeadUrl implementation was not found");
const ownerHeadUrl = Function(`${match[0]}\nreturn ownerHeadUrl;`)();

const absoluteUrl = "https://minotar.net/helm/55306c12-a187-4160-b9da-91798c84492c/96.png";
const capturedUrl = "https://market-api.enthusia.info/v1/player-heads/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.png";
assert.equal(ownerHeadUrl({ avatarUrl: absoluteUrl, type: "PLAYER" }), absoluteUrl);
assert.equal(ownerHeadUrl({ avatarUrl: capturedUrl, type: "PLAYER" }), capturedUrl);
assert.equal(ownerHeadUrl({ avatarUrl: "player-head-java.svg", type: "PLAYER" }), null);
assert.equal(ownerHeadUrl({ avatarUrl: "https://example.com/head.png", type: "PLAYER" }), null);
console.log("Verified owner heads accept only approved Minotar and Market API URLs.");
