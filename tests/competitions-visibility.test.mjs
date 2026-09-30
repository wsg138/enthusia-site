import assert from "node:assert/strict";
import test from "node:test";

import {
  isPubliclyListedVisibility,
  isPubliclyReachableVisibility,
  sanitizeCompetitionVisibility
} from "../functions/lib/competitions/visibility.js";

test("competition visibility supports public, unlisted, and staff-only modes", () => {
  assert.equal(sanitizeCompetitionVisibility("PUBLIC"), "PUBLIC");
  assert.equal(sanitizeCompetitionVisibility("UNLISTED"), "UNLISTED");
  assert.equal(sanitizeCompetitionVisibility("STAFF_ONLY"), "STAFF_ONLY");
  assert.equal(sanitizeCompetitionVisibility("SECRET"), null);
  assert.equal(sanitizeCompetitionVisibility(undefined), "PUBLIC");
});

test("only public competitions are listed while unlisted competitions remain directly reachable", () => {
  assert.equal(isPubliclyListedVisibility("PUBLIC"), true);
  assert.equal(isPubliclyListedVisibility("UNLISTED"), false);
  assert.equal(isPubliclyReachableVisibility("PUBLIC"), true);
  assert.equal(isPubliclyReachableVisibility("UNLISTED"), true);
  assert.equal(isPubliclyReachableVisibility("STAFF_ONLY"), false);
});
