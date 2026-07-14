import { describe, expect, it } from "vitest";
import { signedFetch } from "./helpers";

function probe() {
  return { schemaVersion: 1, serverId: "enthusia-main", serverEpoch: "epoch", eventId: crypto.randomUUID(), sentAt: new Date().toISOString(), probe: "random" };
}

describe("request authentication", () => {
  it("accepts a correct signature", async () => expect((await signedFetch("/internal/v1/test", "POST", probe())).status).toBe(200));
  it("rejects an incorrect signature", async () => expect((await signedFetch("/internal/v1/test", "POST", probe(), { signature: `v1=${"0".repeat(64)}` })).status).toBe(401));
  it("rejects a wrong server ID", async () => expect((await signedFetch("/internal/v1/test", "POST", probe(), { serverId: "other" })).status).toBe(401));
  it("rejects an expired timestamp", async () => expect((await signedFetch("/internal/v1/test", "POST", probe(), { timestamp: String(Date.now() - 301_000) })).status).toBe(401));
  it("rejects a signature for changed body bytes", async () => expect((await signedFetch("/internal/v1/test", "POST", probe(), { secret: "wrong-secret" })).status).toBe(401));
  it("rejects a signature for another pathname", async () => expect((await signedFetch("/internal/v1/test", "POST", probe(), { signedPath: "/internal/v1/other" })).status).toBe(401));
  it("rejects a missing signature header", async () => expect((await signedFetch("/internal/v1/test", "POST", probe(), { omit: "X-Enthusia-Signature" })).status).toBe(401));
});
