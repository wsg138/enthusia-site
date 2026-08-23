import assert from "node:assert/strict";
import test from "node:test";

import {
  canChangeParticipantRoster,
  canVoterVoteForSubmission,
  countsTowardPlayerEntryLimit,
  judgeCanHoldParticipantRole,
  participantCanReceiveRewards,
  participantRewardWeight,
  voterMeetsActivePlaytime
} from "../functions/lib/competitions/participants.js";

test("solo/group owners and main members consume player entry slots, helpers and guild workers do not", () => {
  assert.equal(countsTowardPlayerEntryLimit("SOLO", "OWNER"), true);
  assert.equal(countsTowardPlayerEntryLimit("GROUP", "OWNER"), true);
  assert.equal(countsTowardPlayerEntryLimit("GROUP", "MAIN"), true);
  assert.equal(countsTowardPlayerEntryLimit("GROUP", "HELPER"), false);
  assert.equal(countsTowardPlayerEntryLimit("GUILD", "GUILD_WORKER"), false);
  assert.equal(countsTowardPlayerEntryLimit("GUILD", "OWNER"), false);
});

test("ordinary helpers receive the configured partial reward while assigned judges remain unrewarded", () => {
  assert.equal(judgeCanHoldParticipantRole("HELPER"), true);
  assert.equal(judgeCanHoldParticipantRole("MAIN"), false);
  assert.equal(judgeCanHoldParticipantRole("OWNER"), false);
  assert.equal(judgeCanHoldParticipantRole("GUILD_WORKER"), false);

  assert.equal(participantCanReceiveRewards({
    entryType: "GROUP",
    role: "HELPER",
    isAssignedJudge: false
  }), true);
  assert.equal(participantRewardWeight({
    entryType: "GROUP",
    role: "HELPER",
    isAssignedJudge: false,
    helperRewardMultiplier: 0.5
  }), 0.5);
  assert.equal(participantRewardWeight({
    entryType: "GROUP",
    role: "MAIN",
    isAssignedJudge: false,
    helperRewardMultiplier: 0.5
  }), 1);
  assert.equal(participantCanReceiveRewards({
    entryType: "GROUP",
    role: "HELPER",
    isAssignedJudge: true
  }), false);
});

test("roster locks at voting but existing invitations can still be answered", () => {
  assert.equal(canChangeParticipantRoster("REVIEW", "ADD"), true);
  assert.equal(canChangeParticipantRoster("REVIEW", "REMOVE"), true);
  assert.equal(canChangeParticipantRoster("VOTING", "ADD"), false);
  assert.equal(canChangeParticipantRoster("VOTING", "REMOVE"), false);
  assert.equal(canChangeParticipantRoster("VOTING", "ACCEPT", { existingPendingInvite: true }), true);
  assert.equal(canChangeParticipantRoster("COMPLETED", "ACCEPT", { existingPendingInvite: true }), true);
  assert.equal(canChangeParticipantRoster("CANCELLED", "ACCEPT", { existingPendingInvite: true }), false);
});

test("accepting a pending invite after rewards were delivered gives credit but no reward eligibility", () => {
  assert.equal(participantCanReceiveRewards({
    entryType: "GROUP",
    role: "MAIN",
    acceptedAt: "2026-09-15T00:00:00Z",
    rewardsDeliveredAt: "2026-09-14T00:00:00Z"
  }), false);

  assert.equal(participantCanReceiveRewards({
    entryType: "GROUP",
    role: "HELPER",
    acceptedAt: "2026-09-15T00:00:00Z",
    rewardsDeliveredAt: "2026-09-14T00:00:00Z"
  }), false);

  assert.equal(participantCanReceiveRewards({
    entryType: "GROUP",
    role: "MAIN",
    acceptedAt: "2026-09-13T00:00:00Z",
    rewardsDeliveredAt: "2026-09-14T00:00:00Z"
  }), true);
});

test("helpers may vote for their group entry but owners/main members may not", () => {
  const acceptedParticipants = [
    { playerUuid: "owner", role: "OWNER" },
    { playerUuid: "main", role: "MAIN" },
    { playerUuid: "helper", role: "HELPER" }
  ];

  assert.equal(canVoterVoteForSubmission({ entryType: "GROUP", voterUuid: "owner", acceptedParticipants }), false);
  assert.equal(canVoterVoteForSubmission({ entryType: "GROUP", voterUuid: "main", acceptedParticipants }), false);
  assert.equal(canVoterVoteForSubmission({ entryType: "GROUP", voterUuid: "helper", acceptedParticipants }), true);
  assert.equal(canVoterVoteForSubmission({ entryType: "GROUP", voterUuid: "outsider", acceptedParticipants }), true);
});

test("judges cannot public-vote and guild members cannot vote for their own guild entry", () => {
  assert.equal(canVoterVoteForSubmission({
    entryType: "SOLO",
    voterUuid: "player",
    isAssignedJudge: true
  }), false);
  assert.equal(canVoterVoteForSubmission({
    entryType: "GUILD",
    voterUuid: "player",
    voterIsGuildMember: true
  }), false);
  assert.equal(canVoterVoteForSubmission({
    entryType: "GUILD",
    voterUuid: "outsider",
    voterIsGuildMember: false
  }), true);
});

test("voting playtime requirement uses active minutes", () => {
  assert.equal(voterMeetsActivePlaytime(119, 120), false);
  assert.equal(voterMeetsActivePlaytime(120, 120), true);
  assert.equal(voterMeetsActivePlaytime(500, 120), true);
});
