import assert from "node:assert/strict";
import test from "node:test";

import {
  lifecycleInput,
  publicationTransition,
  transitionValidation
} from "../functions/api/competitions/admin/[id]/lifecycle.js";

const OPERATION_ID = "10000000-0000-4000-8000-000000000001";

test("lifecycle request input normalizes its operation and default note", () => {
  assert.deepEqual(lifecycleInput({
    expectedState: "UPCOMING",
    targetState: "SUBMISSIONS_OPEN",
    idempotencyKey: OPERATION_ID.toUpperCase()
  }), {
    expectedState: "UPCOMING",
    targetState: "SUBMISSIONS_OPEN",
    operationId: OPERATION_ID,
    changeNote: "State changed to SUBMISSIONS_OPEN"
  });
  assert.equal(lifecycleInput({
    expectedState: "UNKNOWN",
    targetState: "UPCOMING",
    idempotencyKey: OPERATION_ID
  }), null);
  assert.equal(lifecycleInput({
    expectedState: "UPCOMING",
    targetState: "SUBMISSIONS_OPEN",
    idempotencyKey: "not-a-uuid"
  }), null);
});

test("lifecycle validation recognizes idempotent replay before stale-state conflict", async () => {
  const current = {
    lifecycleState: "SUBMISSIONS_OPEN",
    lastLifecycleOperationId: OPERATION_ID,
    config: {}
  };
  const response = transitionValidation(current, {
    expectedState: "UPCOMING",
    targetState: "SUBMISSIONS_OPEN",
    operationId: OPERATION_ID
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { competition: current, idempotentReplay: true });
});

test("draft publication is kept on the guarded preparation path", () => {
  assert.equal(publicationTransition({ expectedState: "DRAFT", targetState: "UPCOMING" }), true);
  assert.equal(publicationTransition({ expectedState: "UPCOMING", targetState: "SUBMISSIONS_OPEN" }), false);
});
