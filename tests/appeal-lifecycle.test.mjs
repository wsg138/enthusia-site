import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeEdit } from "../functions/api/appeals/[id]/edit.js";
import { sanitizeClaim } from "../functions/api/reviewer/appeals/[id]/claim.js";
import { sanitizeReopen } from "../functions/api/reviewer/appeals/[id]/reopen.js";
import { staffRoute } from "../functions/lib/staff-api.js";

const APPEAL_ID = "123e4567-e89b-12d3-a456-426614174099";

test("sanitizeEdit accepts a valid player edit", () => {
  assert.deepEqual(sanitizeEdit({
    reason: "I forgot to include the screenshots from the incident.",
    expectedVersion: 2,
    idempotencyKey: "edit-12345678"
  }), {
    reason: "I forgot to include the screenshots from the incident.",
    expectedVersion: 2,
    idempotencyKey: "edit-12345678"
  });
});

test("sanitizeEdit rejects short, long, or missing reasons", () => {
  const base = { expectedVersion: 1, idempotencyKey: "edit-12345678" };
  assert.equal(sanitizeEdit({ ...base, reason: "too short" }), null);
  assert.equal(sanitizeEdit({ ...base, reason: "x".repeat(1001) }), null);
  assert.equal(sanitizeEdit(base), null);
});

test("sanitizeEdit rejects bad versions and replay keys", () => {
  const reason = "A well-formed appeal edit reason with enough detail.";
  assert.equal(sanitizeEdit({ reason, expectedVersion: 0, idempotencyKey: "edit-12345678" }), null);
  assert.equal(sanitizeEdit({ reason, expectedVersion: 1.5, idempotencyKey: "edit-12345678" }), null);
  assert.equal(sanitizeEdit({ reason, expectedVersion: Number.MAX_SAFE_INTEGER + 1, idempotencyKey: "edit-12345678" }), null);
  assert.equal(sanitizeEdit({ reason, expectedVersion: 1 }), null);
  assert.equal(sanitizeEdit({ reason, expectedVersion: 1, idempotencyKey: "short" }), null);
  assert.equal(sanitizeEdit({ reason, expectedVersion: 1, idempotencyKey: "x".repeat(129) }), null);
});

test("sanitizeClaim accepts a valid claim", () => {
  assert.deepEqual(sanitizeClaim({
    expectedVersion: 1,
    idempotencyKey: "claim-12345678"
  }), {
    expectedVersion: 1,
    idempotencyKey: "claim-12345678"
  });
});

test("sanitizeClaim rejects bad versions and replay keys", () => {
  assert.equal(sanitizeClaim({ expectedVersion: 0, idempotencyKey: "claim-12345678" }), null);
  assert.equal(sanitizeClaim({ expectedVersion: "two", idempotencyKey: "claim-12345678" }), null);
  assert.equal(sanitizeClaim({ expectedVersion: 1, idempotencyKey: "short" }), null);
  assert.equal(sanitizeClaim({ expectedVersion: 1 }), null);
});

test("sanitizeReopen accepts a valid reopen", () => {
  assert.deepEqual(sanitizeReopen({
    note: "New evidence provided, reopening for review.",
    expectedVersion: 3,
    idempotencyKey: "reopen-1234567"
  }), {
    note: "New evidence provided, reopening for review.",
    expectedVersion: 3,
    idempotencyKey: "reopen-1234567"
  });
});

test("sanitizeReopen rejects short, long, or missing notes", () => {
  const base = { expectedVersion: 1, idempotencyKey: "reopen-1234567" };
  assert.equal(sanitizeReopen({ ...base, note: "ok" }), null);
  assert.equal(sanitizeReopen({ ...base, note: "x".repeat(1001) }), null);
  assert.equal(sanitizeReopen(base), null);
});

test("sanitizeReopen rejects bad versions and replay keys", () => {
  const note = "Reopening with new context from the player.";
  assert.equal(sanitizeReopen({ note, expectedVersion: 0, idempotencyKey: "reopen-1234567" }), null);
  assert.equal(sanitizeReopen({ note, expectedVersion: 1, idempotencyKey: "bad key with spaces" }), null);
});

test("Staff API allowlist accepts the appeal lifecycle routes", () => {
  assert.equal(staffRoute("/v1/website/appeals/mine"), "/v1/website/appeals/mine");
  assert.equal(
    staffRoute(`/v1/website/appeals/${APPEAL_ID}/edit`),
    `/v1/website/appeals/${APPEAL_ID}/edit`
  );
  assert.equal(
    staffRoute(`/v1/website/appeals/reviewer/${APPEAL_ID}/claim`),
    `/v1/website/appeals/reviewer/${APPEAL_ID}/claim`
  );
  assert.equal(
    staffRoute(`/v1/website/appeals/reviewer/${APPEAL_ID}/reopen`),
    `/v1/website/appeals/reviewer/${APPEAL_ID}/reopen`
  );
});

test("Staff API allowlist rejects malformed lifecycle routes", () => {
  assert.throws(() => staffRoute(`/v1/website/appeals/${APPEAL_ID}`), /Invalid Staff API route/);
  assert.throws(() => staffRoute("/v1/website/appeals/not-a-uuid/edit"), /Invalid Staff API route/);
  assert.throws(() => staffRoute(`/v1/website/appeals/${APPEAL_ID}/delete`), /Invalid Staff API route/);
  assert.throws(() => staffRoute(`/v1/website/appeals/reviewer/not-a-uuid/claim`), /Invalid Staff API route/);
  assert.throws(() => staffRoute(`/v1/website/appeals/reviewer/${APPEAL_ID}/reopened`), /Invalid Staff API route/);
  assert.throws(() => staffRoute(`/v1/website/appeals/reviewer/${APPEAL_ID}/claim/extra`), /Invalid Staff API route/);
});
