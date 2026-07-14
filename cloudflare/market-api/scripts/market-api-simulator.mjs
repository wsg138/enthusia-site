import { readFile } from "node:fs/promises";
import { randomUUID, webcrypto } from "node:crypto";

const crypto = webcrypto;
const encoder = new TextEncoder();
const [command, ...args] = process.argv.slice(2);
const baseUrl = process.env.MARKET_API_BASE_URL?.replace(/\/$/, "");
const secret = process.env.MARKET_SYNC_SECRET;
const serverId = process.env.MARKET_SERVER_ID;
if (!baseUrl || !secret || !serverId) throw new Error("MARKET_API_BASE_URL, MARKET_SYNC_SECRET, and MARKET_SERVER_ID are required.");
if (serverId !== "enthusia-main") throw new Error("MARKET_SERVER_ID must be enthusia-main.");

function fail(message) { throw new Error(message); }
function option(name) { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; }
function hex(buffer) { return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function envelope(epoch, eventId = randomUUID()) {
  return { schemaVersion: 1, serverId, serverEpoch: epoch, eventId, sentAt: new Date().toISOString() };
}

async function sign(method, pathname, rawBody, timestamp, eventId, signingSecret = secret) {
  const hash = hex(await crypto.subtle.digest("SHA-256", encoder.encode(rawBody)));
  const canonical = ["v1", method, pathname, serverId, timestamp, eventId, hash].join("\n");
  const key = await crypto.subtle.importKey("raw", encoder.encode(signingSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `v1=${hex(await crypto.subtle.sign("HMAC", key, encoder.encode(canonical)))}`;
}

async function signedRequest(method, pathname, body, signingSecret = secret) {
  const rawBody = JSON.stringify(body);
  const timestamp = String(Date.now());
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Enthusia-Server-Id": serverId,
      "X-Enthusia-Timestamp": timestamp,
      "X-Enthusia-Event-Id": body.eventId,
      "X-Enthusia-Signature": await sign(method, pathname, rawBody, timestamp, body.eventId, signingSecret),
    },
    body: rawBody,
  });
}

async function jsonResponse(response, expected, label) {
  let data;
  try { data = await response.json(); } catch { fail(`${label} returned a non-JSON response (${response.status}).`); }
  if (response.status !== expected) fail(`${label} returned ${response.status}; expected ${expected}.`);
  return data;
}

async function loadSnapshot() {
  const path = option("--snapshot");
  if (!path) fail("--snapshot <path> is required for this command.");
  const snapshot = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(snapshot.stalls) || snapshot.stalls.length !== 71 || new Set(snapshot.stalls.map((stall) => stall.id)).size !== 71) {
    fail("Snapshot must contain exactly 71 unique stalls.");
  }
  return snapshot;
}

function fullBody(snapshot, epoch, revision) {
  return {
    ...envelope(epoch), snapshotRevision: revision, generatedAt: snapshot.generatedAt,
    stalls: snapshot.stalls.map((stall) => ({ revision, stall })),
  };
}

function waitForMessage(socket, predicate, timeoutMs = 10_000) {
  const queued = socket.marketQueue.findIndex(predicate);
  if (queued >= 0) return Promise.resolve(socket.marketQueue.splice(queued, 1)[0]);
  return new Promise((resolve, reject) => {
    const waiter = { predicate, resolve, reject };
    const timer = setTimeout(() => {
      socket.marketWaiters.splice(socket.marketWaiters.indexOf(waiter), 1);
      reject(new Error("WebSocket message timeout"));
    }, timeoutMs);
    waiter.resolve = (value) => { clearTimeout(timer); resolve(value); };
    socket.marketWaiters.push(waiter);
  });
}

async function openSocket(since) {
  const url = new URL(`${baseUrl}/v1/live`); url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  if (since !== undefined) url.searchParams.set("since", String(since));
  const socket = new WebSocket(url);
  socket.marketQueue = [];
  socket.marketWaiters = [];
  socket.addEventListener("message", (event) => {
    const data = JSON.parse(String(event.data));
    const index = socket.marketWaiters.findIndex((waiter) => waiter.predicate(data));
    if (index >= 0) socket.marketWaiters.splice(index, 1)[0].resolve(data);
    else socket.marketQueue.push(data);
  });
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  return socket;
}

async function runTest() {
  const body = { ...envelope(randomUUID()), probe: randomUUID() };
  const result = await jsonResponse(await signedRequest("POST", "/internal/v1/test", body), 200, "authenticated test");
  if (!result.authenticated) fail("Authenticated test did not confirm authentication.");
  console.log("PASS: authenticated test");
}

async function runFullSync() {
  const snapshot = await loadSnapshot(); const revision = Math.floor(Date.now() / 1000);
  const result = await jsonResponse(await signedRequest("POST", "/internal/v1/full-sync", fullBody(snapshot, randomUUID(), revision)), 200, "full sync");
  if (result.stallCount !== 71) fail("Full sync did not store 71 stalls.");
  console.log("PASS: full sync (71 stalls)");
}

async function runStallUpdate() {
  const snapshot = await loadSnapshot(); const stallId = option("--stall") ?? "stall1";
  const market = await jsonResponse(await fetch(`${baseUrl}/v1/market`), 200, "market snapshot");
  const current = await jsonResponse(await fetch(`${baseUrl}/v1/stalls/${encodeURIComponent(stallId)}`), 200, "current stall");
  const stall = snapshot.stalls.find((entry) => entry.id === stallId); if (!stall) fail(`Snapshot does not contain ${stallId}.`);
  const body = { ...envelope(market.serverEpoch), revision: current.revision + 1, stall };
  await jsonResponse(await signedRequest("PUT", `/internal/v1/stalls/${encodeURIComponent(stallId)}`, body), 200, "stall update");
  console.log(`PASS: stall update (${stallId})`);
}

async function runIntegration() {
  const snapshot = await loadSnapshot(); const epoch = randomUUID(); const baseRevision = Math.floor(Date.now() / 1000);
  const health = await jsonResponse(await fetch(`${baseUrl}/health`), 200, "health"); if (!health.ok) fail("Health response was not OK.");
  await runTest();
  const badBody = { ...envelope(epoch), probe: randomUUID() };
  if ((await signedRequest("POST", "/internal/v1/test", badBody, "intentionally-wrong-secret")).status !== 401) fail("Bad signature was not rejected.");
  const sync = await jsonResponse(await signedRequest("POST", "/internal/v1/full-sync", fullBody(snapshot, epoch, baseRevision)), 200, "initial full sync");
  if (sync.stallCount !== 71) fail("Initial full sync did not store 71 stalls.");
  const market = await jsonResponse(await fetch(`${baseUrl}/v1/market`), 200, "market snapshot"); if (market.stallCount !== 71) fail("Public market did not return 71 stalls.");

  let socket; let replaySocket;
  try {
    const stallId = "stall1"; const original = structuredClone(snapshot.stalls.find((stall) => stall.id === stallId));
    const modified = structuredClone(original); modified.members = [...modified.members, "SimulatorTest"];
    socket = await openSocket(); const hello = await waitForMessage(socket, (data) => data.type === "hello");
    const updateBody = { ...envelope(epoch), revision: baseRevision + 1, stall: modified };
    const updatePromise = waitForMessage(socket, (data) => data.type === "stall.updated" && data.stallId === stallId);
    const updateResult = await jsonResponse(await signedRequest("PUT", `/internal/v1/stalls/${stallId}`, updateBody), 200, "stall update");
    const liveUpdate = await updatePromise; if (liveUpdate.revision !== baseRevision + 1) fail("Live update had the wrong revision.");
    const publicStall = await jsonResponse(await fetch(`${baseUrl}/v1/stalls/${stallId}`), 200, "public stall");
    if (!publicStall.stall.members.includes("SimulatorTest")) fail("Public stall did not reflect the update.");
    const duplicate = await jsonResponse(await signedRequest("PUT", `/internal/v1/stalls/${stallId}`, updateBody), 200, "duplicate update");
    if (duplicate.sequence !== updateResult.sequence) fail("Duplicate event was applied twice.");
    const staleBody = { ...envelope(epoch), revision: baseRevision, stall: original };
    if ((await signedRequest("PUT", `/internal/v1/stalls/${stallId}`, staleBody)).status !== 409) fail("Stale revision was not rejected.");
    socket.close(); socket = undefined;

    replaySocket = await openSocket(hello.sequence);
    await waitForMessage(replaySocket, (data) => data.type === "hello");
    await waitForMessage(replaySocket, (data) => data.type === "stall.updated" && data.sequence === updateResult.sequence);
    replaySocket.close(); replaySocket = undefined;
  } finally {
    socket?.close(); replaySocket?.close();
    await jsonResponse(await signedRequest("POST", "/internal/v1/full-sync", fullBody(snapshot, epoch, baseRevision + 2)), 200, "restoring full sync");
    const finalMarket = await jsonResponse(await fetch(`${baseUrl}/v1/market`), 200, "final market snapshot");
    if (finalMarket.stallCount !== 71) fail("Final market does not contain 71 stalls.");
    const expected = new Map(snapshot.stalls.map((stall) => [stall.id, JSON.stringify(stall)]));
    if (finalMarket.stalls.some((stall) => expected.get(stall.id) !== JSON.stringify(stall))) fail("Final market differs from the approved snapshot.");
  }
  console.log("PASS: health, auth, bad signature, full sync, public API, live update, idempotency, stale revision, replay, restore");
}

try {
  if (command === "test") await runTest();
  else if (command === "full-sync") await runFullSync();
  else if (command === "stall-update") await runStallUpdate();
  else if (command === "integration") await runIntegration();
  else fail("Command must be one of: test, full-sync, stall-update, integration.");
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : "Unexpected simulator error."}`);
  process.exitCode = 1;
}
