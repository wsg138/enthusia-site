import assert from "node:assert/strict";
import test from "node:test";

import { punishmentQuery } from "../functions/api/punishments.js";
import {
  canonicalCaseId,
  sanitizePublicPunishment,
  sanitizePublicPunishmentCollection
} from "../functions/lib/public-punishment.js";
import { publicStaffRoute, staffApiOrigin } from "../functions/lib/staff-api.js";

const PUBLIC_PUNISHMENT = {
  player: "PlayerOne",
  punishmentType: "BAN",
  broadReason: "Griefing",
  publicReason: "Griefing another player's build",
  issuedAt: "2026-09-01T12:00:00Z",
  expiresAt: "2026-10-01T12:00:00Z",
  remainingSeconds: 3600,
  state: "ACTIVE",
  caseId: "0123456789ABCDEF",
  appealAvailable: true
};

test("public punishment queries permit only bounded filters and cursors", () => {
  const query = punishmentQuery(new Request("https://example.test/api/punishments?type=ban&cursor=abc_123"));
  assert.equal(query.path, "/v1/public/punishments");
  assert.equal(query.parameters.get("type"), "BAN");
  assert.equal(query.parameters.get("cursor"), "abc_123");
  assert.equal(query.parameters.get("limit"), "30");
  assert.equal(punishmentQuery(new Request("https://example.test/api/punishments?type=private")), null);
  assert.equal(punishmentQuery(new Request("https://example.test/api/punishments?cursor=bad%2Fcursor")), null);
});

test("public punishment search is isolated from list parameters", () => {
  const query = punishmentQuery(new Request("https://example.test/api/punishments?q=PlayerOne&type=BAN&cursor=ignored"));
  assert.equal(query.path, "/v1/public/search");
  assert.deepEqual([...query.parameters], [["q", "PlayerOne"]]);
  assert.equal(punishmentQuery(new Request(`https://example.test/api/punishments?q=${"x".repeat(81)}`)), null);
});

test("Staff API requests select only fixed production or preview targets", () => {
  assert.equal(staffApiOrigin({}), "https://staff-api.enthusia.info");
  assert.equal(
    staffApiOrigin({ STAFF_API_TARGET: "preview" }),
    "https://staff-api-dev.enthusia.info"
  );
  assert.throws(() => staffApiOrigin({ STAFF_API_TARGET: "https://evil.example" }), /target is invalid/);
  assert.throws(() => staffApiOrigin({ STAFF_API_TARGET: "staging" }), /target is invalid/);
});

test("case IDs match the current EnthusiaStaff Crockford contract", () => {
  assert.equal(canonicalCaseId("0123456789abcdef"), "0123456789ABCDEF");
  assert.equal(canonicalCaseId("0123456789ABCDEI"), null);
  assert.equal(canonicalCaseId("../private-route"), null);
  assert.equal(publicStaffRoute("/v1/public/cases/0123456789ABCDEF"), "/v1/public/cases/0123456789ABCDEF");
  assert.throws(() => publicStaffRoute("/v1/public/cases/../../website/appeals"), /Invalid public Staff API route/);
});

test("public projections discard any upstream private fields", () => {
  const sanitized = sanitizePublicPunishment({
    ...PUBLIC_PUNISHMENT,
    targetId: "private-player-id",
    evidence: ["private-media"],
    staffNotes: "private-note",
    coordinates: "1,2,3",
    reporter: "private-reporter"
  });
  assert.deepEqual(sanitized, PUBLIC_PUNISHMENT);
  assert.equal(Object.hasOwn(sanitized, "targetId"), false);
  assert.equal(Object.hasOwn(sanitized, "evidence"), false);
  assert.equal(Object.hasOwn(sanitized, "staffNotes"), false);
  assert.equal(Object.hasOwn(sanitized, "coordinates"), false);
  assert.equal(Object.hasOwn(sanitized, "reporter"), false);
});

test("public collections fail closed on malformed records or cursors", () => {
  assert.deepEqual(
    sanitizePublicPunishmentCollection({ items: [PUBLIC_PUNISHMENT], nextCursor: "next_1" }, true),
    { items: [PUBLIC_PUNISHMENT], nextCursor: "next_1" }
  );
  assert.equal(sanitizePublicPunishmentCollection({ items: [{ ...PUBLIC_PUNISHMENT, player: "bad name" }] }), null);
  assert.equal(sanitizePublicPunishmentCollection({ items: [PUBLIC_PUNISHMENT], nextCursor: "../bad" }, true), null);
});
