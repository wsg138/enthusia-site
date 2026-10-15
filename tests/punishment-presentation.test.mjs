import assert from "node:assert/strict";
import test from "node:test";
import { punishmentReason, punishmentDuration, punishmentStatus, publicPunishmentLink } from "../public/assets/punishment-presentation.js";
import { punishmentQuery } from "../functions/api/punishments.js";
import { sanitizePublicPunishment } from "../functions/lib/public-punishment.js";
const warning = { player: "PlayerOne", punishmentType: "WARNING", broadReason: "legacy.warning", publicReason: "Swearing", issuedAt: "2026-10-01T12:00:00Z", expiresAt: "2026-10-08T12:00:00Z", remainingSeconds: 0, state: "EXPIRED", caseId: "0123456789ABCDEF", appealAvailable: false };

test("both warning filter spellings use the supported native WARNING contract", () => {
  for (const type of ["WARN", "WARNING", "warn"]) assert.equal(punishmentQuery(new Request(`https://example.test/api/punishments?type=${type}`)).parameters.get("type"), "WARNING");
});

test("historical warnings remain records without a duration or expired countdown", () => {
  assert.equal(punishmentDuration(warning), null);
  assert.equal(punishmentStatus(warning), "Recorded");
  assert.equal(punishmentStatus({ ...warning, state: "REVOKED" }), "Removed");
  assert.equal(punishmentReason(warning), "Swearing");
  assert.equal(punishmentReason({ ...warning, publicReason: "Imported legacy punishment" }), "Reason not recorded in the previous system.");
  assert.equal(punishmentReason({ ...warning, publicReason: "" }), "Reason not recorded in the previous system.");
});

test("missing historical warning reasons do not reject otherwise valid public records", () => {
  for (const reason of [null, "", " "]) {
    const row = sanitizePublicPunishment({ ...warning, publicReason: reason, broadReason: null });
    assert.equal(row.publicReason, "Reason not recorded in the previous system.");
    assert.equal(row.broadReason, "Warning");
  }
  assert.equal(sanitizePublicPunishment({ ...warning, publicReason: "x".repeat(1001) }), null);
  assert.equal(sanitizePublicPunishment({ ...warning, punishmentType: "BAN", publicReason: null }), null);
});

test("finite durations describe the original punishment rather than time remaining", () => {
  assert.equal(punishmentDuration({ ...warning, punishmentType: "MUTE", remainingSeconds: 3600 }), "7 days");
  assert.equal(punishmentDuration({ ...warning, punishmentType: "BAN", expiresAt: null }), "Permanent");
  assert.equal(punishmentDuration({ ...warning, punishmentType: "BAN", expiresAt: "invalid" }), "Unavailable");
});

test("account punishment links stay on the public page and encode their search target", () => {
  assert.equal(publicPunishmentLink(warning), "/punishments.html?q=0123456789ABCDEF");
  const target = new URL(publicPunishmentLink({ minecraftName: "../other?x=1" }), "https://enthusia.info");
  assert.equal(target.pathname, "/punishments.html");
  assert.equal(target.searchParams.get("q"), "../other?x=1");
});
