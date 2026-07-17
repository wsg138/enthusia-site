import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../public/assets/market/market.js", import.meta.url), "utf8");
const start = source.indexOf("  const minotarHeadUrlPattern");
const end = source.indexOf("  const ownerType", start);
assert.ok(start >= 0 && end > start, "Market owner visual helpers were not found");

const state = { imageResult: "load", requested: [] };
class TestImage {
  constructor() { this.dataset = {}; }
  set src(value) {
    this._src = value;
    state.requested.push(value);
    queueMicrotask(() => state.imageResult === "load" ? this.onload?.() : this.onerror?.());
  }
  get src() { return this._src; }
}
const context = vm.createContext({
  assetBase: "assets/market/",
  esc: value => String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]),
  window: {}, Image: TestImage, Promise, JSON, queueMicrotask,
});
vm.runInContext(`${source.slice(start, end)}; globalThis.ownerVisual = ownerVisual; globalThis.ownerHeadUrl = ownerHeadUrl; globalThis.hydrateOwnerVisuals = hydrateOwnerVisuals;`, context, {filename: "market.js"});

const player = (avatarUrl, source = "JAVA") => ({type: "PLAYER", name: "Test Player", avatarUrl, avatar: {kind: "MINECRAFT_HEAD", source, includesOuterLayer: true}});
const capturedUrl = "https://market-api.enthusia.info/v1/player-heads/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.png";
const minotarUrl = "https://minotar.net/helm/TestPlayer/96.png";
const makeNode = url => ({
  dataset: {ownerHeadUrl: url, ownerHeadName: "Test Player", skinSource: "JAVA", outerLayer: "true"},
  classList: {remove() {}, add() {}},
  replaceChildren(value) { this.replacement = value; },
  setAttribute(name, value) { this.attributes ??= {}; this.attributes[name] = value; },
  removeAttribute(name) { delete this.dataset[name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]; },
});
const rootFor = node => ({querySelectorAll(selector) { return selector.startsWith("[data-owner-head-url]") ? [node] : []; }});

let passed = 0;
async function test(name, callback) { await callback(); passed += 1; console.log(`PASS: ${name}`); }

await test("null avatarUrl renders a generic player head without requesting an image", () => {
  state.requested = [];
  const markup = context.ownerVisual(player(null));
  assert.match(markup, /player-head fallback/);
  assert.match(markup, /player-head-base\.svg/);
  assert.match(markup, /player-head-overlay\.svg/);
  assert.doesNotMatch(markup, /data-owner-head-url/);
});

await test("captured Bedrock URL renders generic content before loading", () => {
  const markup = context.ownerVisual(player(capturedUrl, "BEDROCK_CAPTURED"));
  assert.match(markup, /player-head fallback/);
  assert.match(markup, new RegExp(capturedUrl));
});

await test("successful captured-head loading replaces the generic content", async () => {
  state.imageResult = "load"; state.requested = [];
  const node = makeNode(capturedUrl); context.hydrateOwnerVisuals(rootFor(node));
  await Promise.resolve();
  assert.equal(state.requested[0], capturedUrl); assert.equal(node.replacement?.src, capturedUrl);
});

await test("captured-head 404 and Minotar failure retain the generic player head", async () => {
  state.imageResult = "error";
  for (const url of [capturedUrl, minotarUrl]) {
    state.requested = []; const node = makeNode(url); context.hydrateOwnerVisuals(rootFor(node));
    await Promise.resolve();
    assert.equal(node.replacement, undefined); assert.equal(node.dataset.headFailed, "true"); assert.equal(state.requested[0], url);
  }
});

await test("invalid URLs are not requested and retain the generic player head", () => {
  state.requested = [];
  const markup = context.ownerVisual(player("player-head-java.svg"));
  assert.match(markup, /player-head fallback/); assert.doesNotMatch(markup, /data-owner-head-url/);
  assert.equal(context.ownerHeadUrl(player("https://example.test/head.png")), null);
});

console.log(`Market owner visual tests passed: ${passed}`);
