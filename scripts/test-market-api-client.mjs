import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const sourcePath = new URL("../public/assets/market/market-api-client.js", import.meta.url);
const source = await readFile(sourcePath, "utf8");
const fallback = JSON.parse(await readFile(new URL("../public/assets/market/sample-market-snapshot.json", import.meta.url), "utf8"));
const expectedStallIds = fallback.stalls.map(stall => stall.id);
const apiSnapshot = (sequence = 10, stalls = fallback.stalls, revision = 1) => ({
  schemaVersion: 1, serverId: "enthusia-main", serverEpoch: "test-epoch", snapshotRevision: revision,
  sequence, generatedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), stallCount: 71, stalls
});
const response = (body, ok = true, status = 200) => ({ok, status, async json() { return structuredClone(body); }});

class MockWebSocket {
  static instances = [];
  constructor(url) { this.url = url; this.readyState = 0; this.listeners = new Map(); MockWebSocket.instances.push(this); }
  addEventListener(type, listener) { const values = this.listeners.get(type) || []; values.push(listener); this.listeners.set(type, values); }
  emit(type, value = {}) { for (const listener of this.listeners.get(type) || []) listener(value); }
  open() { this.readyState = 1; this.emit("open"); }
  message(value) { this.emit("message", {data: JSON.stringify(value)}); }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.emit("close"); }
}

function loadClient() {
  const listeners = new Map();
  const window = {
    location: {protocol: "https:"}, fetch: null, WebSocket: MockWebSocket,
    setTimeout, clearTimeout,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); }
  };
  const document = {visibilityState: "visible", addEventListener() {}, removeEventListener() {}};
  const context = vm.createContext({window, document, navigator: {onLine: true}, URL, AbortController, console, Date, JSON, Set, Map});
  vm.runInContext(source, context, {filename: "market-api-client.js"});
  return {MarketApiClient: window.EnthusiaMarketApi.MarketApiClient, validateSnapshot: window.EnthusiaMarketApi.validateSnapshot, window};
}

function harness(fetches) {
  MockWebSocket.instances.length = 0;
  const {MarketApiClient} = loadClient();
  const timers = [], statuses = [], snapshots = [], updates = [];
  const fetchImpl = async (...args) => {
    const next = fetches.shift();
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(...args) : next;
  };
  const client = new MarketApiClient({
    expectedStallIds, fallbackSnapshot: fallback, fetchImpl, WebSocketImpl: MockWebSocket,
    setTimeoutImpl(fn, delay) { const timer = {fn, delay, active: true}; timers.push(timer); return timer; },
    clearTimeoutImpl(timer) { if (timer) timer.active = false; },
    onStatus(status) { statuses.push(status); }, onSnapshot(snapshot, meta) { snapshots.push({snapshot, meta}); },
    onStallUpdate(stallId, stall, snapshot, meta) { updates.push({stallId, stall, snapshot, meta}); }
  });
  return {client, timers, statuses, snapshots, updates};
}

let passed = 0;
async function test(name, callback) {
  await callback(); passed += 1; console.log(`PASS: ${name}`);
}

await test("successful API startup", async () => {
  const h = harness([response(apiSnapshot())]);
  const loaded = await h.client.loadInitialSnapshot();
  assert.equal(loaded.stalls.length, 71); assert.equal(h.client.source, "api"); assert.equal(h.client.sequence, 10);
});

await test("API failure uses local fallback", async () => {
  const h = harness([new Error("offline")]); const loaded = await h.client.loadInitialSnapshot();
  assert.equal(loaded.stalls.length, 71); assert.equal(h.client.source, "fallback"); assert.equal(h.statuses.at(-1).state, "fallback");
});

await test("invalid API snapshot uses local fallback", async () => {
  const h = harness([response({...apiSnapshot(), stalls: fallback.stalls.slice(1)})]); await h.client.loadInitialSnapshot();
  assert.equal(h.client.source, "fallback");
});

await test("transaction quantities are required and may exceed item stack limits", async () => {
  const {validateSnapshot} = loadClient();
  const stalls = structuredClone(fallback.stalls), shop = stalls.flatMap(stall => stall.shops)[0];
  shop.sellItem.amount = 1; shop.sellAmount = 64; shop.costItem.amount = 1; shop.costAmount = 100000;
  assert.ok(validateSnapshot(apiSnapshot(10, stalls), expectedStallIds));
  delete shop.costAmount;
  assert.equal(validateSnapshot(apiSnapshot(10, stalls), expectedStallIds), null);
});

await test("stall.updated replaces only one stall", async () => {
  const h = harness([response(apiSnapshot())]); await h.client.loadInitialSnapshot();
  const before = h.client.snapshot.stalls, untouched = before[1], changed = {...before[0], members: [...before[0].members, "LiveTest"]};
  h.client.handleMessage(JSON.stringify({type: "stall.updated", sequence: 11, stallId: changed.id, revision: 2, updatedAt: new Date().toISOString(), stall: changed}));
  assert.equal(h.client.snapshot.stalls[1], untouched); assert.notEqual(h.client.snapshot.stalls[0], before[0]); assert.equal(h.updates.length, 1);
});

await test("older sequence is ignored", async () => {
  const h = harness([response(apiSnapshot())]); await h.client.loadInitialSnapshot();
  h.client.handleMessage(JSON.stringify({type: "stall.updated", sequence: 9, stallId: fallback.stalls[0].id, stall: fallback.stalls[0]}));
  assert.equal(h.updates.length, 0); assert.equal(h.client.sequence, 10);
});

await test("sequence gap triggers snapshot resync", async () => {
  const h = harness([response(apiSnapshot()), response(apiSnapshot(15, fallback.stalls, 2))]); await h.client.loadInitialSnapshot();
  h.client.handleMessage(JSON.stringify({type: "stall.updated", sequence: 12, stallId: fallback.stalls[0].id, stall: fallback.stalls[0]}));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(h.snapshots.length, 1); assert.equal(h.client.sequence, 15);
});

for (const eventType of ["market.replaced", "resync_required"]) {
  await test(`${eventType} fetches a full snapshot`, async () => {
    const h = harness([response(apiSnapshot()), response(apiSnapshot(20, fallback.stalls, 2))]); await h.client.loadInitialSnapshot();
    h.client.handleMessage(JSON.stringify({type: eventType, sequence: 11}));
    await new Promise(resolve => setImmediate(resolve)); assert.equal(h.snapshots.length, 1); assert.equal(h.client.sequence, 20);
  });
}

await test("reconnection uses the latest since sequence", async () => {
  const h = harness([response(apiSnapshot(33))]); await h.client.loadInitialSnapshot(); h.client.startLive();
  const first = MockWebSocket.instances[0]; assert.match(first.url, /since=33/); first.open(); first.close();
  const reconnect = h.timers.find(timer => timer.active && timer.delay === 1000); assert.ok(reconnect); reconnect.active = false; reconnect.fn();
  assert.match(MockWebSocket.instances[1].url, /since=33/);
});

await test("malformed messages do not change state", async () => {
  const h = harness([response(apiSnapshot())]); await h.client.loadInitialSnapshot(); h.client.handleMessage("not-json");
  assert.equal(h.client.sequence, 10); assert.equal(h.updates.length, 0);
});

await test("browser code uses only the approved public API origin", async () => {
  assert.doesNotMatch(source, /\/internal\/|MARKET_SYNC_SECRET|CLOUDFLARE_API_TOKEN/i);
  const remoteUrls = [...source.matchAll(/https:\/\/[^"'`\s]+/g)].map(match => match[0]);
  assert.deepEqual([...new Set(remoteUrls)], ["https://market-api.enthusia.info"]);
});

console.log(`Market API client tests passed: ${passed}`);
