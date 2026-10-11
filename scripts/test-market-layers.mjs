import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Loading the browser file sets globalThis.EnthusiaMarketLayers, as it sets window.EnthusiaMarketLayers on the page.
await import("../public/assets/market/map-layers.js");
const { rentInfo, summarize, describe, heat, LAYERS } = globalThis.EnthusiaMarketLayers;
const layout = JSON.parse(await readFile("public/assets/market/market-layout.json", "utf8"));
const snapshot = JSON.parse(await readFile("public/assets/market/sample-market-snapshot.json", "utf8"));
const now = new Date("2026-07-13T12:00:00-04:00").getTime();
const hours = n => new Date(now + n * 3600000).toISOString();
const owned = nextRentAt => ({ owner: { type: "PLAYER" }, nextRentAt, shops: [] });

assert.equal(rentInfo({ owner: { type: "NONE" }, shops: [] }, now).bucket, "available");
assert.equal(rentInfo(owned(hours(5)), now).bucket, "urgent");
assert.equal(rentInfo(owned(hours(5)), now).label, "5h");
assert.equal(rentInfo(owned(hours(50)), now).bucket, "soon");
assert.equal(rentInfo(owned(hours(50)), now).label, "2d");
assert.equal(rentInfo(owned(hours(24 * 6)), now).bucket, "healthy");
assert.equal(rentInfo(owned(hours(-1)), now).bucket, "overdue");
assert.equal(rentInfo(owned(null), now).bucket, "unknown");
assert.equal(rentInfo({ ...owned(hours(5)), stallState: "GRACE" }, now).bucket, "overdue");
assert.equal(rentInfo({ ...owned(hours(5)), stallState: "AUCTIONING" }, now).bucket, "auction");

assert.deepEqual([0, 1, 3, 4, 8, 9, 14, 15].map(heat), ["none", "heat1", "heat1", "heat2", "heat2", "heat3", "heat3", "heat4"]);

const byId = new Map(snapshot.stalls.map(stall => [stall.id, stall]));
let shops = 0, stalls = 0;
for (const building of layout.buildings) {
  const summary = summarize(building, byId, now);
  stalls += summary.stalls; shops += summary.shops;
  assert.equal(summary.inStock + summary.outOfStock, summary.shops, `${building.id} stock adds up`);
  for (const layer of LAYERS) {
    const info = describe(layer.id, summary);
    assert.ok(info.bucket && typeof info.label === "string" && typeof info.line === "string", `${building.id}/${layer.id} describes`);
    const known = new Set([...layer.legend.map(entry => entry[0]), "none"]);
    assert.ok(known.has(info.bucket), `${building.id}/${layer.id} bucket ${info.bucket} is in the legend`);
  }
}
assert.equal(stalls, layout.stalls.length);
assert.equal(shops, snapshot.fixtureStatistics.totalShops);
assert.equal(describe("shops", null).bucket, "none");
console.log(`Verified map layers across ${layout.buildings.length} buildings, ${stalls} stalls and ${shops} shops.`);
