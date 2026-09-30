import assert from "node:assert/strict";
import test from "node:test";

import {
  publicationFailureResponse,
  publicationInput,
  publicationStateResponse
} from "../functions/api/competitions/admin/[id]/results/publish.js";

const OPERATION_ID = "10000000-0000-4000-8000-000000000001";

test("results publication input normalizes its operation and audit note", () => {
  assert.deepEqual(publicationInput({
    idempotencyKey: OPERATION_ID.toUpperCase(),
    note: "  Published after final review  "
  }), {
    operationId: OPERATION_ID,
    publishNote: "Published after final review"
  });
  assert.deepEqual(publicationInput({ idempotencyKey: OPERATION_ID }), {
    operationId: OPERATION_ID,
    publishNote: "Final competition results published"
  });
  assert.equal(publicationInput({ idempotencyKey: "not-a-uuid" }), null);
});

test("results publication recognizes an exact completed replay", async () => {
  const competition = {
    lifecycleState: "COMPLETED",
    lastLifecycleOperationId: OPERATION_ID
  };
  const response = publicationStateResponse(competition, OPERATION_ID);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { competition, idempotentReplay: true });

  const conflict = publicationStateResponse({ lifecycleState: "JUDGING" }, OPERATION_ID);
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: "competition_state_conflict", currentState: "JUDGING" });
});

test("results publication classifies database guards as conflicts", async () => {
  const conflict = publicationFailureResponse(new Error("competition_results_incomplete"));
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: "competition_results_publish_conflict" });

  const unavailable = publicationFailureResponse(new Error("database unavailable"));
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: "competition_results_publish_failed" });
});
