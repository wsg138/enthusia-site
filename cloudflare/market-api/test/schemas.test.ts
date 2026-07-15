import { describe, expect, it } from "vitest";
import { EXPECTED_STALL_IDS } from "../src/expected-stalls";
import { fullSyncSchema, stallSchema, stallUpdateSchema } from "../src/schemas";
import { fullSyncBody, makeStall, signedFetch } from "./helpers";

describe("strict public schemas", () => {
  it("accepts a valid stall", () => expect(stallSchema.safeParse(makeStall("stall1")).success).toBe(true));
  it("accepts authoritative owned, grace, and emergency-auction rent states", () => {
    const owned = { ...makeStall("stall1"), stallState: "OWNED", ownerSince: "2026-07-01T12:00:00Z", nextRentAt: "2026-07-02T12:00:00Z", rentTimingStatus: "PERSISTED" };
    const grace = { ...owned, stallState: "GRACE", nextRentAt: null, graceEndsAt: "2026-07-04T12:00:00Z", rentTimingStatus: "UNAVAILABLE" };
    const emergency = { ...owned, stallState: "EMERGENCY_AUCTIONING", nextRentAt: null, graceEndsAt: null, rentTimingStatus: "NOT_APPLICABLE" };
    expect(stallSchema.safeParse(owned).success).toBe(true);
    expect(stallSchema.safeParse(grace).success).toBe(true);
    expect(stallSchema.safeParse(emergency).success).toBe(true);
    expect(stallSchema.safeParse({ ...owned, graceEndsAt: "2026-07-04T12:00:00Z" }).success).toBe(false);
  });
  it("accepts a Java outer-layer head URL", () => {
    const stall = makeStall("stall1");
    stall.owner = {
      ...stall.owner,
      type: "PLAYER",
      id: "00000000-0000-4000-8000-000000000099",
      uuid: "00000000-0000-4000-8000-000000000099",
      name: "SyntheticJava",
      avatarUrl: "https://minotar.net/helm/00000000-0000-4000-8000-000000000099/96.png",
      avatar: { kind: "MINECRAFT_HEAD", source: "JAVA", includesOuterLayer: true },
    };
    expect(stallSchema.safeParse(stall).success).toBe(true);
  });
  it("accepts zero- and six-layer guild banners in order", () => {
    const stall = makeStall("stall1");
    const bannerOwner = (patterns: Array<{type: string; color: string}>) => ({
      ...stall.owner,
      type: "GUILD" as const,
      id: "synthetic-guild",
      name: "Synthetic Guild",
      avatar: { kind: "GUILD_BANNER", source: "LUMAGUILDS", banner: { baseColor: "BLUE", patterns } },
    });
    expect(stallSchema.safeParse({ ...stall, owner: bannerOwner([]) }).success).toBe(true);
    const patterns = [
      { type: "STRIPE_TOP", color: "WHITE" }, { type: "CROSS", color: "RED" },
      { type: "BORDER", color: "BLACK" }, { type: "TRIANGLE_TOP", color: "YELLOW" },
      { type: "CIRCLE", color: "LIME" }, { type: "FLOWER", color: "PURPLE" },
    ];
    const parsed = stallSchema.safeParse({ ...stall, owner: bannerOwner(patterns) });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.owner.avatar.banner?.patterns.map(pattern => pattern.type)).toEqual(patterns.map(pattern => pattern.type));
  });
  it("rejects unsupported, oversized, and private banner data", () => {
    const stall = makeStall("stall1");
    const banner = { baseColor: "BLUE", patterns: Array.from({ length: 7 }, () => ({ type: "CROSS", color: "RED" })), privateItemStack: "no" };
    expect(stallSchema.safeParse({ ...stall, owner: { ...stall.owner, type: "GUILD", avatar: { kind: "GUILD_BANNER", banner } } }).success).toBe(false);
    expect(stallSchema.safeParse({ ...stall, owner: { ...stall.owner, type: "GUILD", avatar: { kind: "GUILD_BANNER", banner: { baseColor: "BLUE", patterns: [{ type: "UNKNOWN", color: "RED" }] } } } }).success).toBe(false);
  });
  it("accepts canonical Java UUID text without requiring RFC version or variant bits", () => {
    const proxyStyleUuid = "00000000-0000-0009-0000-000000000001";
    const stall = makeStall("stall1");
    stall.owner = { ...stall.owner, type: "PLAYER", id: proxyStyleUuid, uuid: proxyStyleUuid, name: "Example Player" };
    expect(stallSchema.safeParse(stall).success).toBe(true);
    expect(stallSchema.safeParse({ ...stall, owner: { ...stall.owner, uuid: "not-a-guid" } }).success).toBe(false);
  });
  it("keeps transaction quantities separate from item stack quantities", () => {
    const stall = makeStall("stall1");
    stall.shops.push({
      id: 1,
      owner: { id: "00000000-0000-4000-8000-000000000001", name: "P2wn" },
      direction: "SELL",
      sellItem: { material: "DIAMOND", displayName: "Diamond", amount: 1, icon: null, metadata: {} },
      sellAmount: 64,
      costItem: { material: "PAPER", displayName: "Currency", amount: 1, icon: null, metadata: {} },
      costAmount: 100_000,
      interaction: { world: "world", x: 1, y: 64, z: 2, source: "SHOP_SIGN" },
      stockCount: 128,
      availableTrades: 2,
      searchable: true,
    });
    expect(stallSchema.safeParse(stall).success).toBe(true);
    const withoutAmount = structuredClone(stall) as unknown as { shops: Array<Record<string, unknown>> };
    delete withoutAmount.shops[0].costAmount;
    expect(stallSchema.safeParse(withoutAmount).success).toBe(false);
  });
  it("rejects an unknown private field", () => expect(stallSchema.safeParse({ ...makeStall("stall1"), staffNotes: "private" }).success).toBe(false));
  it("rejects duplicate full-sync stall IDs", () => {
    const body = fullSyncBody(); body.stalls[1].stall.id = body.stalls[0].stall.id;
    expect(fullSyncSchema.safeParse(body).success).toBe(false);
  });
  it("rejects a missing canonical stall", () => {
    const body = fullSyncBody(); body.stalls.pop();
    expect(fullSyncSchema.safeParse(body).success).toBe(false);
  });
  it("rejects an extra stall", () => {
    const body = fullSyncBody(); body.stalls.push({ revision: 1, stall: makeStall("stall1") });
    expect(fullSyncSchema.safeParse(body).success).toBe(false);
  });
  it("contains exactly 71 expected IDs", () => expect(new Set(EXPECTED_STALL_IDS).size).toBe(71));
  it("rejects a route and payload stall mismatch", async () => {
    const eventId = crypto.randomUUID();
    const body = { schemaVersion: 1, serverId: "enthusia-main", serverEpoch: "epoch", eventId, sentAt: new Date().toISOString(), revision: 2, stall: makeStall("stall2") };
    expect(stallUpdateSchema.safeParse(body).success).toBe(true);
    expect((await signedFetch("/internal/v1/stalls/stall1", "PUT", body)).status).toBe(400);
  });
  it("rejects an oversized update payload", async () => {
    const eventId = crypto.randomUUID();
    const response = await signedFetch("/internal/v1/stalls/stall1", "PUT", { schemaVersion: 1, serverId: "enthusia-main", serverEpoch: "epoch", eventId, sentAt: new Date().toISOString(), padding: "x".repeat(257 * 1024) });
    expect(response.status).toBe(413);
  });
  it("returns only bounded safe diagnostics for an authenticated schema failure", async () => {
    const eventId = crypto.randomUUID();
    const privateValue = "private-owner-value";
    const body = fullSyncBody();
    body.eventId = eventId;
    body.stalls[0].stall.ownerSince = privateValue;
    const response = await signedFetch("/internal/v1/full-sync", "POST", body);
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).not.toContain(privateValue);
    expect(JSON.parse(text).error.diagnostic.issues[0]).toMatchObject({
      path: "stalls[0].stall.ownerSince",
      code: "invalid_format",
      received: "string",
      length: privateValue.length,
    });
  });
});
