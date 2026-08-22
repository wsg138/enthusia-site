import assert from "node:assert/strict";
import test from "node:test";

import {
  publicCompetitionConfig,
  publicCompetitionDetail,
  publicEntriesVisibleInState,
  publicSubmissionDetail
} from "../functions/lib/competitions/public.js";
import {
  competitionSlug,
  groupParticipants
} from "../functions/api/competitions/[slug].js";

test("entries remain hidden until public viewing stages begin", () => {
  for (const state of ["UPCOMING", "SUBMISSIONS_OPEN", "REVIEW"]) {
    assert.equal(publicEntriesVisibleInState(state), false, state);
  }
  for (const state of ["VOTING", "JUDGING", "RESULTS_READY", "COMPLETED", "ARCHIVED"]) {
    assert.equal(publicEntriesVisibleInState(state), true, state);
  }
});

test("public config exposes entrant-facing rules without private integration settings", () => {
  const projection = publicCompetitionConfig({
    public: { summary: "Summary", description: "Description", rules: "Rules" },
    appearance: { bannerImageId: "banner", accent: "#FF8800" },
    schedule: { submissionsOpenAt: "2026-09-01T00:00:00.000Z" },
    entries: {
      allowedTypes: ["SOLO", "GUILD"],
      maxEntriesPerPlayer: 3,
      maxEntriesPerGuild: 1,
      maxImages: 8,
      minImages: 1,
      maxDescriptionChars: 2500,
      coordinatesRequested: true,
      judgesCanViewCoordinates: true,
      maxMainMembers: null,
      maxHelpers: 10,
      guildSubmissionPermission: "secret.permission.name"
    },
    voting: {
      enabled: true,
      votesPerVoter: 3,
      minimumActiveMinutes: 120,
      allowChangesUntilClose: true,
      showTotalsToStaff: true
    },
    judging: {
      enabled: true,
      criteria: [{ id: "build", label: "Build quality", maxScore: 10, weight: 1, privateNote: "no" }],
      communityWeight: 25,
      judgeWeight: 75,
      tiebreakRule: "JUDGE_REVOTE",
      publicFeedbackOptional: true
    },
    moderation: { minecraftPrivacyReview: "MANUAL_STAFF" }
  });

  assert.equal(projection.entries.coordinatesRequested, true);
  assert.equal(projection.entries.judgesCanViewCoordinates, true);
  assert.equal("guildSubmissionPermission" in projection.entries, false);
  assert.equal("moderation" in projection, false);
  assert.equal("showTotalsToStaff" in projection.voting, false);
  assert.deepEqual(projection.judging.criteria, [
    { id: "build", label: "Build quality", maxScore: 10, weight: 1 }
  ]);
});

test("public competition detail is an explicit whitelist", () => {
  const detail = publicCompetitionDetail({
    id: "c1",
    slug: "summer-build",
    title: "Summer Build",
    category: "Build",
    visibility: "PUBLIC",
    lifecycleState: "UPCOMING",
    configVersion: 2,
    publishedAt: "2026-08-22T00:00:00.000Z",
    createdByUuid: "private",
    config: {}
  });
  assert.equal(detail.title, "Summer Build");
  assert.equal("createdByUuid" in detail, false);
});

test("public submission projection never includes private locations or moderation notes", () => {
  const detail = publicSubmissionDetail({
    id: "s1",
    competitionId: "c1",
    entryType: "GROUP",
    ownerUuid: "owner-uuid",
    ownerName: "Owner",
    title: "Entry",
    description: "Description",
    revision: 1,
    staffEdited: 1,
    worldName: "world",
    x: 100,
    privateNote: "secret"
  }, [{ playerUuid: "helper", playerName: "Helper", role: "HELPER", inviteStatus: "ACCEPTED" }]);

  assert.equal(detail.staffEdited, true);
  assert.equal("worldName" in detail, false);
  assert.equal("x" in detail, false);
  assert.equal("privateNote" in detail, false);
  assert.deepEqual(detail.participants, [
    { playerUuid: "helper", playerName: "Helper", role: "HELPER" }
  ]);
});

test("detail API slug validation rejects reserved and malformed values", () => {
  assert.equal(competitionSlug({ params: { slug: "Summer-Build" } }), "summer-build");
  assert.equal(competitionSlug({ params: { slug: "../../admin" } }), null);
  assert.equal(competitionSlug({ params: { slug: "" } }), null);
});

test("participant grouping is stable per submission", () => {
  const grouped = groupParticipants([
    { submissionId: "s1", playerName: "A" },
    { submissionId: "s2", playerName: "B" },
    { submissionId: "s1", playerName: "C" }
  ]);
  assert.deepEqual(grouped.get("s1").map((row) => row.playerName), ["A", "C"]);
  assert.deepEqual(grouped.get("s2").map((row) => row.playerName), ["B"]);
});
