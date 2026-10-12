import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAppealEmail } from "../functions/lib/appeal-email-auth.js";

test("email normalization retains the supported address grammar", () => {
  for (const value of ["a@b.c", "Player+appeal@Example.com", "a.b@example-domain.info", "x@ab.example"])
    assert.equal(normalizeAppealEmail(value), value.toLowerCase());
  for (const value of ["a@@b.c", "a@b", "a@-b.c", "a@b-.c", "a@b..c", "a b@c.d", "a@b.c/other", "x@" + "a".repeat(64) + ".com", "a".repeat(255)])
    assert.equal(normalizeAppealEmail(value), null);
  assert.equal(normalizeAppealEmail(" Player@Example.com "), "player@example.com");
});
