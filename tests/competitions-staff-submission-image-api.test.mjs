import assert from "node:assert/strict";
import test from "node:test";

import { manualUploadStateResponse } from "../functions/api/competitions/admin/[id]/submissions/[submissionId]/images/index.js";

async function responseBody(response) {
  return { status: response.status, body: await response.json() };
}

test("staff upload state permits only editable manual submissions", async () => {
  const competition = { lifecycleState: "REVIEW" };
  const manual = {
    ownerSubject: "staff-manual:entry",
    status: "NEEDS_CHANGES",
    revision: 3
  };
  assert.equal(manualUploadStateResponse(competition, manual, 3), null);

  assert.deepEqual(
    await responseBody(manualUploadStateResponse(competition, { ...manual, ownerSubject: "discord:123" }, 3)),
    { status: 409, body: { error: "manual_submission_required" } }
  );
  assert.deepEqual(
    await responseBody(manualUploadStateResponse({ lifecycleState: "VOTING" }, manual, 3)),
    { status: 409, body: { error: "submission_locked" } }
  );
  assert.deepEqual(
    await responseBody(manualUploadStateResponse(competition, manual, 2)),
    { status: 409, body: { error: "submission_revision_conflict" } }
  );
});
