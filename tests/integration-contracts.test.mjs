import { randomUUID } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { signedStaffRequest, signedStaffGet } from "../functions/lib/staff-api.js";
import { publicModerationResponse } from "../functions/lib/moderation-projection.js";

const id = "123e4567-e89b-42d3-a456-426614174099";
const env = { STAFF_API_TARGET: "preview", STAFF_API_BEARER_TOKEN: randomUUID(), STAFF_API_HMAC_SECRET: randomUUID() };

test("integrated appeal lifecycle and moderation requests stay on the configured Staff target", async () => {
  const before = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return Response.json({}); };
  try {
    for (const route of ["/v1/website/appeals/mine", `/v1/website/appeals/${id}/edit`, `/v1/website/appeals/reviewer/${id}/claim`, `/v1/website/appeals/reviewer/${id}/reopen`]) await signedStaffRequest(env, route, { expectedVersion: 2 });
    await signedStaffGet(env, "/v1/public/search?q=Preview+Player");
    assert.equal(calls.length, 5);
    for (const call of calls) {
      assert.equal(new URL(call.url).origin, "https://staff-api-dev.enthusia.info");
      assert.ok(call.options.headers["x-enthusia-signature"]);
    }
    assert.equal(calls.at(-1).options.method, "GET");
    assert.equal(new URL(calls.at(-1).url).search, "?q=Preview+Player");
    await assert.rejects(signedStaffGet(env, "https://evil.example"), /Invalid/);
    await assert.rejects(signedStaffGet({ ...env, STAFF_API_TARGET: "" }, "/v1/public/search?q=test"), /target/);
    assert.equal(calls.length, 5);
  } finally { globalThis.fetch = before; }
});

test("moderation aliases project public DTOs and reject malformed responses", async () => {
  const item = { player: "PreviewPlayer", punishmentType: "MUTE", broadReason: "CHAT", publicReason: "Public sample", issuedAt: "2026-10-11T12:00:00Z", expiresAt: null, state: "ACTIVE", caseId: "01K0000000000000", remainingSeconds: null, appealAvailable: true, privateNotes: "never expose", accessToken: "never expose" };
  for (const mode of ["list", "search", "case"]) {
    const response = await publicModerationResponse(Response.json(mode === "case" ? item : { items: [item], nextCursor: null, privateNotes: "never expose" }), mode, "public, max-age=20");
    assert.equal(response.status, 200);
    assert.ok(!(await response.text()).includes("never expose"));
  }
  const rejected = await publicModerationResponse(Response.json({ items: [{ player: "bad" }] }), "list", "public, max-age=20");
  assert.equal(rejected.status, 502);
});

test("all public features remain discoverable and shared scripts load once", async () => {
  const pages = ["index.html", "account.html", "appeal.html", "gallery.html", "moderation.html", "events.html", "punishments.html", "competitions/index.html", "competitions/detail.html", "reviewer/index.html", "competitions/admin/index.html"];
  for (const page of pages) {
    const html = await readFile(new URL("../public/" + page, import.meta.url), "utf8");
    const header = html.match(/<header class="site-head[\s\S]*?<\/header>/)?.[0];
    assert.ok(header, `${page}: shared header`);
    for (const feature of ["account.html", "appeal.html", "gallery.html", "moderation.html", "events.html", "punishments.html", "competitions/index.html", "market.html"]) assert.ok(header.includes(feature), `${page}: ${feature} missing`);
    const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1].split("?")[0]);
    assert.equal(scripts.length, new Set(scripts).size, `${page}: duplicate scripts`);
  }
});
