import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL(
  "../functions/api/competitions/admin/[id]/submissions/[submissionId].js",
  import.meta.url
);

test("staff submission mutations use the full linked/guild conflict checker", async () => {
  const source = await readFile(routeUrl, "utf8");
  assert.match(source, /import \{ staffSubmissionConflict \}/);
  assert.match(source, /await staffSubmissionConflict\(/);
  assert.match(source, /OWNER_OR_LINKED_OWNER|staff_cannot_moderate_own_entry/);
  assert.match(source, /staff_conflict_check_unavailable/);

  for (const action of [
    "FLAG",
    "CLEAR_FLAG",
    "APPROVE",
    "NEEDS_CHANGES",
    "REJECT",
    "DISQUALIFY",
    "REMOVE",
    "RESTORE",
    "EDIT"
  ]) {
    assert.match(source, new RegExp(`\\"${action}\\"`));
  }
});
