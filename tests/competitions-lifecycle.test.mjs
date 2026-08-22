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
