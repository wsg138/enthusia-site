import assert from "node:assert/strict";
import test from "node:test";

import {
  inviteFailureResponse,
  inviteResponseInput
} from "../functions/api/competitions/invites.js";

const COMPETITION_ID = "10000000-0000-4000-8000-000000000001";
const SUBMISSION_ID = "20000000-0000-4000-8000-000000000002";
const PLAYER_UUID = "30000000-0000-4000-8000-000000000003";

test("invite response input is limited to a linked canonical player", () => {
  const accounts = new Set([PLAYER_UUID]);
  assert.deepEqual(inviteResponseInput({
    competitionId: COMPETITION_ID.toUpperCase(),
    submissionId: SUBMISSION_ID,
    playerUuid: PLAYER_UUID,
    accept: true,
    ignored: "value"
  }, accounts), {
    competitionId: COMPETITION_ID,
    submissionId: SUBMISSION_ID,
    playerUuid: PLAYER_UUID,
    accept: true
  });
  assert.equal(inviteResponseInput({
    competitionId: COMPETITION_ID,
    submissionId: SUBMISSION_ID,
    playerUuid: "40000000-0000-4000-8000-000000000004",
    accept: true
  }, accounts), null);
  assert.equal(inviteResponseInput({
    competitionId: COMPETITION_ID,
    submissionId: SUBMISSION_ID,
    playerUuid: PLAYER_UUID,
    accept: "true"
  }, accounts), null);
});

test("invite persistence conflicts return stable player-facing errors", async () => {
  const judgeResponse = inviteFailureResponse(new Error("competition_linked_judge_cannot_enter"));
  assert.equal(judgeResponse.status, 409);
  assert.deepEqual(await judgeResponse.json(), { error: "judge_can_only_be_helper" });

  const limitResponse = inviteFailureResponse(new Error("competition_linked_entry_limit_reached"));
  assert.equal(limitResponse.status, 409);
  assert.deepEqual(await limitResponse.json(), { error: "player_entry_limit_reached" });

  const unavailable = inviteFailureResponse(new Error("database unavailable"));
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: "invite_response_failed" });
});
