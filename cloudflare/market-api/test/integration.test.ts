import { SELF, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { initialize, makeStall, nextMessage, signedFetch } from "./helpers";

async function connect(since?: number) {
  const suffix = since === undefined ? "" : `?since=${since}`;
  const response = await SELF.fetch(`https://example.test/v1/live${suffix}`, { headers: { Upgrade: "websocket", Origin: "https://enthusia.info" } });
  expect(response.status).toBe(101);
  const socket = response.webSocket!; socket.accept();
  return socket;
}

describe("live WebSocket integration", () => {
  it("upgrades and sends hello", async () => {
    await initialize(); const socket = await connect(); const hello = await nextMessage(socket);
    expect(hello.type).toBe("hello"); expect(hello.initialized).toBe(true); socket.close();
  });
  it("broadcasts a stall update after persistence", async () => {
    const init = await initialize(); const socket = await connect(); await nextMessage(socket);
    const eventId = crypto.randomUUID(); const body = { schemaVersion: 1, serverId: "enthusia-main", serverEpoch: init.body.serverEpoch, eventId, sentAt: new Date().toISOString(), revision: 2, stall: { ...makeStall("stall1"), members: ["P2wn"] } };
    const eventPromise = nextMessage(socket);
    expect((await signedFetch("/internal/v1/stalls/stall1", "PUT", body)).status).toBe(200);
    const event = await eventPromise; expect(event.type).toBe("stall.updated"); expect(event.revision).toBe(2); socket.close();
  });
  it("broadcasts one market.replaced event for a full sync", async () => {
    const init = await initialize(); const socket = await connect(); const hello = await nextMessage(socket);
    const { fullSyncBody } = await import("./helpers"); const body = fullSyncBody(2, init.body.serverEpoch);
    const eventPromise = nextMessage(socket);
    expect((await signedFetch("/internal/v1/full-sync", "POST", body)).status).toBe(200);
    const event = await eventPromise; expect(event.type).toBe("market.replaced"); expect(Number(event.sequence)).toBe(Number(hello.sequence) + 1); socket.close();
  });
  it("replays missed events in sequence order", async () => {
    const init = await initialize(); const since = Number(init.result.sequence);
    const eventId = crypto.randomUUID(); const body = { schemaVersion: 1, serverId: "enthusia-main", serverEpoch: init.body.serverEpoch, eventId, sentAt: new Date().toISOString(), revision: 2, stall: makeStall("stall1") };
    await signedFetch("/internal/v1/stalls/stall1", "PUT", body);
    const socket = await connect(since); expect((await nextMessage(socket)).type).toBe("hello"); expect((await nextMessage(socket)).type).toBe("stall.updated"); socket.close();
  });
  it("requires a resync when the requested sequence predates retained history", async () => {
    await initialize();
    const bindings = env as unknown as { MARKET_ROOM: DurableObjectNamespace; MARKET_OBJECT_NAME: string };
    const stub = bindings.MARKET_ROOM.get(bindings.MARKET_ROOM.idFromName(bindings.MARKET_OBJECT_NAME));
    await runInDurableObject(stub, async (_instance, state) => {
      const event = JSON.stringify({ type: "market.replaced", schemaVersion: 1, sequence: 1001, snapshotRevision: 1, generatedAt: new Date().toISOString() });
      state.storage.sql.exec("DELETE FROM events");
      state.storage.sql.exec("UPDATE meta SET value = '1001' WHERE key = 'sequence'");
      state.storage.sql.exec("INSERT INTO events(event_id, sequence, created_at, event_json, response_json) VALUES (?, 1001, ?, ?, '{}')", crypto.randomUUID(), new Date().toISOString(), event);
    });
    const socket = await connect(0); expect((await nextMessage(socket)).type).toBe("hello");
    const resync = await nextMessage(socket); expect(resync.type).toBe("resync_required"); expect(resync.reason).toBe("history_unavailable"); socket.close();
  });
  it("requires a WebSocket upgrade", async () => expect((await SELF.fetch("https://example.test/v1/live")).status).toBe(426));
});
