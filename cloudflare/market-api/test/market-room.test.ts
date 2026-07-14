import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { fullSyncBody, initialize, makeStall, signedFetch } from "./helpers";

async function update(revision: number, epoch: string, eventId = crypto.randomUUID()) {
  const body = { schemaVersion: 1, serverId: "enthusia-main", serverEpoch: epoch, eventId, sentAt: new Date().toISOString(), revision, stall: makeStall("stall1") };
  return { body, response: await signedFetch("/internal/v1/stalls/stall1", "PUT", body) };
}

describe("market storage and public API", () => {
  it("returns 503 before initialization", async () => expect((await SELF.fetch("https://example.test/v1/market")).status).toBe(503));
  it("initializes and returns 71 naturally sorted stalls", async () => {
    expect((await initialize()).response.status).toBe(200);
    const data = await (await SELF.fetch("https://example.test/v1/market")).json<{ stallCount: number; stalls: Array<{ id: string }> }>();
    expect(data.stallCount).toBe(71); expect(data.stalls[0].id).toBe("stall1"); expect(data.stalls[70].id).toBe("stall71");
  });
  it("replaces the active generation with a newer full sync", async () => {
    const init = await initialize();
    const body = fullSyncBody(2, init.body.serverEpoch); body.stalls[0].stall.owner.name = "Replacement";
    expect((await signedFetch("/internal/v1/full-sync", "POST", body)).status).toBe(200);
    const market = await (await SELF.fetch("https://example.test/v1/market")).json<{ snapshotRevision: number; stalls: Array<{ owner: { name: string } }> }>();
    expect(market.snapshotRevision).toBe(2); expect(market.stalls[0].owner.name).toBe("Replacement"); expect(market.stalls).toHaveLength(71);
  });
  it("applies newer updates and rejects older revisions", async () => {
    const init = await initialize(); expect((await update(2, init.body.serverEpoch)).response.status).toBe(200); expect((await update(1, init.body.serverEpoch)).response.status).toBe(409);
  });
  it("deduplicates an event ID", async () => {
    const init = await initialize(); const eventId = crypto.randomUUID(); const first = await update(2, init.body.serverEpoch, eventId); const second = await signedFetch("/internal/v1/stalls/stall1", "PUT", first.body);
    expect(first.response.status).toBe(200); expect(second.status).toBe(200); expect(await second.json()).toEqual(await first.response.json());
  });
  it("rejects an epoch mismatch", async () => { await initialize(); expect((await update(2, "wrong-epoch")).response.status).toBe(409); });
  it("serves an individual stall and honors ETags", async () => {
    await initialize(); const first = await SELF.fetch("https://example.test/v1/stalls/stall1"); const etag = first.headers.get("ETag");
    expect(first.status).toBe(200); expect(etag).toBeTruthy();
    expect((await SELF.fetch("https://example.test/v1/stalls/stall1", { headers: { "If-None-Match": etag! } })).status).toBe(304);
  });
  it("allows only configured CORS origins", async () => {
    const allowed = await SELF.fetch("https://example.test/health", { headers: { Origin: "https://enthusia.info" } });
    const denied = await SELF.fetch("https://example.test/health", { headers: { Origin: "https://evil.example" } });
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe("https://enthusia.info"); expect(denied.status).toBe(403);
  });
  it("does not expose a partially invalid generation", async () => {
    const init = await initialize(); const invalid = fullSyncBody(2, init.body.serverEpoch); invalid.stalls.pop();
    expect((await signedFetch("/internal/v1/full-sync", "POST", invalid)).status).toBe(400);
    const market = await (await SELF.fetch("https://example.test/v1/market")).json<{ snapshotRevision: number; stallCount: number }>();
    expect(market.snapshotRevision).toBe(1); expect(market.stallCount).toBe(71);
  });
});
