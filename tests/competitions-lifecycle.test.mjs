import assert from "node:assert/strict";
import test from "node:test";

import { initialCompetitionConfig } from "../functions/lib/competitions/config.js";
import {
  canTransitionCompetition,
  isCompetitionState,
  validatePublishableCompetitionConfig
} from "../functions/lib/competitions/lifecycle.js";

function scheduledConfig() {
  const config = initialCompetitionConfig();
  config.schedule.submissionsOpenAt = "2026-09-01T00:00:00Z";
  config.schedule.submissionsCloseAt = "2026-09-08T00:00:00Z";
  config.schedule.reviewCloseAt = "2026-09-09T00:00:00Z";
  return config;
}

test("competition lifecycle only permits forward configured transitions", () => {
  assert.equal(isCompetitionState("DRAFT"), true);
  assert.equal(isCompetitionState("UNKNOWN"), false);
  assert.equal(canTransitionCompetition("DRAFT", "UPCOMING"), true);
  assert.equal(canTransitionCompetition("UPCOMING", "DRAFT"), false);
  assert.equal(canTransitionCompetition("COMPLETED", "ARCHIVED"), true);
  assert.equal(canTransitionCompetition("ARCHIVED", "COMPLETED"), false);
});

test("results can never be published automatically", () => {
  assert.equal(canTransitionCompetition("RESULTS_READY", "COMPLETED"), true);
  assert.equal(
    canTransitionCompetition("RESULTS_READY", "COMPLETED", { automatic: true }),
    false
  );
});

test("safe solo competition becomes publishable after required schedule is set", () => {
  const errors = validatePublishableCompetitionConfig(scheduledConfig());
  assert.deepEqual(errors, []);
});

test("default unscheduled draft is not publishable", () => {
  const errors = validatePublishableCompetitionConfig(initialCompetitionConfig());
  const codes = errors.map((error) => error.code);
  assert.ok(codes.includes("submissions_open_missing"));
  assert.ok(codes.includes("submissions_close_missing"));
  assert.ok(codes.includes("review_close_missing"));
});

test("group competitions require an explicit main-member limit", () => {
  const config = scheduledConfig();
  config.entries.allowedTypes = ["SOLO", "GROUP"];
  const errors = validatePublishableCompetitionConfig(config);
  assert.ok(errors.some((error) => error.code === "group_main_limit_missing"));

  config.entries.maxMainMembers = 6;
  assert.deepEqual(validatePublishableCompetitionConfig(config), []);
});

test("judge coordinate access requires coordinates to be collected", () => {
  const config = scheduledConfig();
  config.entries.judgesCanViewCoordinates = true;
  assert.ok(
    validatePublishableCompetitionConfig(config)
      .some((error) => error.code === "judge_coordinates_without_locations")
  );
});

test("voting enforces review ordering, active playtime, and no judge ballot", () => {
  const config = scheduledConfig();
  config.voting.enabled = true;
  config.schedule.votingOpenAt = "2026-09-09T00:00:00Z";
  config.schedule.votingCloseAt = "2026-09-12T00:00:00Z";
  assert.deepEqual(validatePublishableCompetitionConfig(config), []);

  config.voting.minimumActiveMinutes = -1;
  config.voting.judgesCanVote = true;
  const codes = validatePublishableCompetitionConfig(config).map((error) => error.code);
  assert.ok(codes.includes("active_playtime_invalid"));
  assert.ok(codes.includes("judges_cannot_vote"));
});

test("combined community and judge scoring must total 100 percent", () => {
  const config = scheduledConfig();
  config.voting.enabled = true;
  config.schedule.votingOpenAt = "2026-09-09T00:00:00Z";
  config.schedule.votingCloseAt = "2026-09-12T00:00:00Z";
  config.judging.enabled = true;
  config.schedule.judgingOpenAt = "2026-09-12T00:00:00Z";
  config.schedule.judgingCloseAt = "2026-09-14T00:00:00Z";
  config.judging.criteria = [{ id: "creativity", label: "Creativity", maxScore: 10, weight: 1 }];
  config.judging.tiebreakRule = "JUDGE_REVOTE";
  config.judging.communityWeight = 25;
  config.judging.judgeWeight = 75;
  assert.deepEqual(validatePublishableCompetitionConfig(config), []);

  config.judging.judgeWeight = 70;
  assert.ok(
    validatePublishableCompetitionConfig(config)
      .some((error) => error.code === "combined_weights_invalid")
  );
});

test("required moderation controls cannot be disabled for a publishable competition", () => {
  const config = scheduledConfig();
  config.moderation.requireStaffApproval = false;
  config.moderation.openAIModeration = false;
  const codes = validatePublishableCompetitionConfig(config).map((error) => error.code);
  assert.ok(codes.includes("staff_review_required"));
  assert.ok(codes.includes("openai_moderation_required"));
});

test("publishable validation preserves the full policy error order", () => {
  const config = scheduledConfig();
  config.schedule.submissionsCloseAt = "2026-08-31T00:00:00Z";
  config.schedule.reviewCloseAt = "2026-08-30T00:00:00Z";
  Object.assign(config.entries, {
    allowedTypes: ["UNKNOWN", "GUILD", "GROUP"],
    maxEntriesPerPlayer: 0,
    maxEntriesPerGuild: 0,
    maxMainMembers: 0,
    maxImages: 9,
    minImages: 10,
    maxDescriptionChars: 2499,
    judgesCanViewCoordinates: true,
    coordinatesRequested: false
  });
  Object.assign(config.moderation, {
    requireStaffApproval: false,
    openAIModeration: false,
    reviewGraceMinutes: -1
  });
  Object.assign(config.voting, {
    enabled: true,
    votesPerVoter: 0,
    minimumActiveMinutes: -1,
    judgesCanVote: true
  });
  Object.assign(config.judging, {
    enabled: true,
    criteria: [{ id: "", label: "", maxScore: 5, weight: 0 }],
    tiebreakRule: null,
    communityWeight: null,
    judgeWeight: null
  });

  assert.deepEqual(
    validatePublishableCompetitionConfig(config).map((error) => error.code),
    [
      "submission_schedule_invalid",
      "review_schedule_invalid",
      "entry_types_invalid",
      "player_entry_limit_invalid",
      "guild_entry_limit_invalid",
      "group_main_limit_missing",
      "image_limit_invalid",
      "minimum_images_invalid",
      "description_limit_invalid",
      "judge_coordinates_without_locations",
      "staff_review_required",
      "openai_moderation_required",
      "review_grace_invalid",
      "voting_schedule_missing",
      "votes_per_voter_invalid",
      "active_playtime_invalid",
      "judges_cannot_vote",
      "judging_schedule_missing",
      "judging_criterion_invalid",
      "tiebreak_rule_missing",
      "combined_weights_invalid"
    ]
  );
});
