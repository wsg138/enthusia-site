import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("moderation page uses a CSP-compliant external same-origin script", () => {
  const html = readFileSync(new URL("../public/moderation.html", import.meta.url), "utf8");
  const policy = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
  assert.match(policy, /script-src 'self'/);
  assert.match(html, /<script src="assets\\/moderation\\.js\\?v=1" defer><\\/script>/);
  assert.doesNotMatch(html, /<script\\s*>/i);
  const script = readFileSync(new URL("../public/assets/moderation.js", import.meta.url), "utf8");
  assert.match(script, /loadRecent\\(true\\)/);
});

import { buildPunishmentsTarget, clampLimit } from "../functions/api/moderation/punishments.js";
import { buildSearchTarget, isValidSearchQuery } from "../functions/api/moderation/search.js";
import { buildCaseTarget, isValidCaseId } from "../functions/api/moderation/cases/[id].js";

test("appeal and staff reviewer interfaces comply with script-src self", () => {
  const cases = [
    ["../public/appeal.html", "assets/appeal.js?v=1", "../public/assets/appeal.js"],
    ["../public/reviewer/appeals.html", "../assets/reviewer-appeals.js?v=1", "../public/assets/reviewer-appeals.js"]
  ];
  for (const [htmlPath, src, jsPath] of cases) {
    const html = readFileSync(new URL(htmlPath, import.meta.url), "utf8");
    assert.doesNotMatch(html, /<script(?:\\s+type="module")?\\s*>/i);
    assert.ok(html.includes(`src="${src}"`));
    assert.ok(readFileSync(new URL(jsPath, import.meta.url), "utf8").includes("fetch("));
  }
});

test("public case renderer never enumerates unapproved case fields", () => {
  const script = readFileSync(new URL("../public/assets/moderation.js", import.meta.url), "utf8");
  assert.doesNotMatch(script, /Object\\.keys\\(detail\\)/);
  assert.doesNotMatch(script, /JSON\\.stringify\\(value\\)/);
  assert.match(script, /"publicReason"/);
});

test("buildPunishmentsTarget defaults to limit=30 with no other params", () => {
  assert.equal(buildPunishmentsTarget(), "/v1/public/punishments?limit=30");
  assert.equal(buildPunishmentsTarget({}), "/v1/public/punishments?limit=30");
});

test("buildPunishmentsTarget keeps fixed key order: type, cursor, limit", () => {
  assert.equal(
    buildPunishmentsTarget({ limit: 10, cursor: "abc", type: "BAN" }),
    "/v1/public/punishments?type=BAN&cursor=abc&limit=10"
  );
});

test("buildPunishmentsTarget includes only present params", () => {
  assert.equal(
    buildPunishmentsTarget({ type: "MUTE" }),
    "/v1/public/punishments?type=MUTE&limit=30"
  );
  assert.equal(
    buildPunishmentsTarget({ cursor: "next-token" }),
    "/v1/public/punishments?cursor=next-token&limit=30"
  );
});

test("buildPunishmentsTarget drops empty type and cursor", () => {
  assert.equal(
    buildPunishmentsTarget({ type: "", cursor: "" }),
    "/v1/public/punishments?limit=30"
  );
});

test("buildPunishmentsTarget encodes special characters", () => {
  const target = buildPunishmentsTarget({ type: "BAN & MUTE", cursor: "a+b/c?d=e" });
  assert.equal(
    target,
    "/v1/public/punishments?type=BAN+%26+MUTE&cursor=a%2Bb%2Fc%3Fd%3De&limit=30"
  );
});

test("clampLimit defaults, clamps, and rejects garbage", () => {
  assert.equal(clampLimit(null), 30);
  assert.equal(clampLimit(undefined), 30);
  assert.equal(clampLimit(""), 30);
  assert.equal(clampLimit("25"), 25);
  assert.equal(clampLimit(50), 50);
  assert.equal(clampLimit(0), 1);
  assert.equal(clampLimit(-5), 1);
  assert.equal(clampLimit(100), 100);
  assert.equal(clampLimit(101), 100);
  assert.equal(clampLimit(99999), 100);
  assert.equal(clampLimit("banana"), 30);
  assert.equal(clampLimit("12.9"), 12);
});

test("buildPunishmentsTarget clamps the limit it sends", () => {
  assert.equal(buildPunishmentsTarget({ limit: 500 }), "/v1/public/punishments?limit=100");
  assert.equal(buildPunishmentsTarget({ limit: 0 }), "/v1/public/punishments?limit=1");
  assert.equal(buildPunishmentsTarget({ limit: "nope" }), "/v1/public/punishments?limit=30");
});

test("isValidCaseId accepts the plugin's allowed alphabet", () => {
  assert.ok(isValidCaseId("CASE-1234"));
  assert.ok(isValidCaseId("a"));
  assert.ok(isValidCaseId("A-Za-z0-9_-"));
  assert.ok(isValidCaseId("x".repeat(64)));
});

test("isValidCaseId rejects everything else", () => {
  assert.ok(!isValidCaseId(""));
  assert.ok(!isValidCaseId("x".repeat(65)));
  assert.ok(!isValidCaseId("case 123"));
  assert.ok(!isValidCaseId("case/123"));
  assert.ok(!isValidCaseId("case.123"));
  assert.ok(!isValidCaseId("../cases"));
  assert.ok(!isValidCaseId(null));
  assert.ok(!isValidCaseId(undefined));
  assert.ok(!isValidCaseId(123));
});

test("buildCaseTarget appends the validated id to the path", () => {
  assert.equal(buildCaseTarget("CASE-1234"), "/v1/public/cases/CASE-1234");
});

test("isValidSearchQuery requires 2-64 non-blank characters", () => {
  assert.ok(isValidSearchQuery("Notch"));
  assert.ok(isValidSearchQuery("CASE-1234"));
  assert.ok(isValidSearchQuery("  padded  "));
  assert.ok(isValidSearchQuery("x".repeat(64)));
  assert.ok(!isValidSearchQuery(""));
  assert.ok(!isValidSearchQuery("A"));
  assert.ok(isValidSearchQuery("AB"));
  assert.ok(!isValidSearchQuery("   "));
  assert.ok(!isValidSearchQuery("x".repeat(65)));
  assert.ok(!isValidSearchQuery(null));
  assert.ok(!isValidSearchQuery(undefined));
});

test("buildSearchTarget trims and encodes the query", () => {
  assert.equal(buildSearchTarget("  Notch  "), "/v1/public/search?q=Notch");
  assert.equal(buildSearchTarget("a b&c?"), "/v1/public/search?q=a%20b%26c%3F");
});
