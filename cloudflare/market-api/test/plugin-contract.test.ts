import { describe, expect, it } from "vitest";
import { fullSyncSchema, stallSchema, stallUpdateSchema, testRequestSchema } from "../src/schemas";
import { signature, signedFetch } from "./helpers";
import fullText from "./fixtures/plugin-contract/full.json?raw";
import guildText from "./fixtures/plugin-contract/guild-stall.json?raw";
import soloText from "./fixtures/plugin-contract/solo-stall.json?raw";
import stallText from "./fixtures/plugin-contract/stall.json?raw";
import testText from "./fixtures/plugin-contract/test.json?raw";
import unownedText from "./fixtures/plugin-contract/unowned-stall.json?raw";

const fixtures: Record<string, string> = {
  "full.json": fullText,
  "guild-stall.json": guildText,
  "solo-stall.json": soloText,
  "stall.json": stallText,
  "test.json": testText,
  "unowned-stall.json": unownedText,
};
const read = (name: string): { text: string; data: Record<string, unknown> } => {
  const text = fixtures[name];
  return { text, data: JSON.parse(text) as Record<string, unknown> };
};

describe("exact Kotlin plugin payload contract", () => {
  it("accepts all exact DTO variants with explicit nullable fields", () => {
    expect(testRequestSchema.safeParse(read("test.json").data).success).toBe(true);
    expect(stallUpdateSchema.safeParse(read("stall.json").data).success).toBe(true);
    expect(fullSyncSchema.safeParse(read("full.json").data).success).toBe(true);
    for (const owner of ["unowned", "solo", "guild"]) {
      expect(stallSchema.safeParse(read(`${owner}-stall.json`).data).success).toBe(true);
    }
  });

  it("fits every route body limit and signs the exact same bytes deterministically", async () => {
    const test = read("test.json"), stall = read("stall.json"), full = read("full.json");
    expect(new TextEncoder().encode(test.text).byteLength).toBeLessThanOrEqual(32 * 1024);
    expect(new TextEncoder().encode(stall.text).byteLength).toBeLessThanOrEqual(256 * 1024);
    expect(new TextEncoder().encode(full.text).byteLength).toBeLessThanOrEqual(4 * 1024 * 1024);
    const eventId = String(stall.data.eventId), timestamp = "1720958400000";
    expect(await signature("PUT", "/internal/v1/stalls/stall1", stall.text, timestamp, eventId))
      .toBe(await signature("PUT", "/internal/v1/stalls/stall1", stall.text, timestamp, eventId));
  });

  it("accepts exact payloads on all three internal route handlers", async () => {
    const test = read("test.json").data, full = read("full.json").data, stall = read("stall.json").data;
    expect((await signedFetch("/internal/v1/test", "POST", test)).status).toBe(200);
    expect((await signedFetch("/internal/v1/full-sync", "POST", full)).status).toBe(200);
    expect((await signedFetch("/internal/v1/stalls/stall1", "PUT", stall)).status).toBe(200);
  });

  it("rejects header/body event drift, route/stall drift, and unknown keys", async () => {
    const fixture = read("stall.json").data;
    expect((await signedFetch("/internal/v1/stalls/stall1", "PUT", fixture, {
      headerEventId: "00000000-0000-4000-8000-000000000099",
    })).status).toBe(400);
    expect((await signedFetch("/internal/v1/stalls/stall2", "PUT", fixture)).status).toBe(400);
    expect(stallUpdateSchema.safeParse({ ...fixture, privateField: true }).success).toBe(false);
  });
});
