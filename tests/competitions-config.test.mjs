import assert from "node:assert/strict";
import test from "node:test";

import {
  competitionSlug,
  initialCompetitionConfig,
  sanitizeCompetitionConfig,
  sanitizeDraftCompetition
} from "../functions/lib/competitions/config.js";

test("competition slugs are stable and URL-safe", () => {
  assert.equal(competitionSlug("  Summer Build Competition!  "), "summer-build-competition");
  assert.equal(competitionSlug("Map Art & Redstone"), "map-art-redstone");
});

test("draft competition basics are normalized without accepting invalid values", () => {
  assert.deepEqual(
    sanitizeDraftCompetition({
      title: "  Summer   Build  ",
      category: " Build ",
      summary: "A server-wide build contest."
    }),
    {
      title: "Summer Build",
      category: "Build",
      summary: "A server-wide build contest.",
      slug: "summer-build"
    }
  );

  assert.equal(sanitizeDraftCompetition({ title: "x", category: "Build" }), null);
  assert.equal(sanitizeDraftCompetition({ title: "Valid title", category: "" }), null);
});

test("new competition configuration starts safe and unpublished by behavior", () => {
  const config = initialCompetitionConfig({ summary: "Test" });
  assert.deepEqual(config.entries.allowedTypes, ["SOLO"]);
  assert.equal(config.entries.maxEntriesPerPlayer, 3);
  assert.equal(config.entries.maxEntriesPerGuild, 1);
  assert.equal(config.entries.maxImages, 8);
  assert.equal(config.entries.maxDescriptionChars, 2500);
  assert.equal(config.entries.judgesCanViewCoordinates, false);
  assert.equal(config.voting.enabled, false);
  assert.equal(config.voting.votesPerVoter, 3);
  assert.equal(config.voting.minimumActiveMinutes, 120);
  assert.equal(config.voting.helpersCanVoteOwnEntry, true);
  assert.equal(config.voting.guildMembersCanVoteOwnEntry, false);
  assert.equal(config.voting.judgesCanVote, false);
  assert.equal(config.judging.enabled, false);
  assert.equal(config.judging.allowNonStaffJudges, true);
  assert.equal(config.moderation.requireStaffApproval, true);
  assert.equal(config.moderation.reviewGraceMinutes, 1440);
  assert.equal(config.moderation.openAIModeration, true);
  assert.equal(config.moderation.minecraftPrivacyReview, "MANUAL_STAFF");
});

test("editor config sanitization preserves safe choices and locks security invariants", () => {
  const input = initialCompetitionConfig({ summary: "Build something memorable" });
  input.appearance.accent = "#a1b2c3";
  input.entries.allowedTypes = ["SOLO", "GROUP", "GROUP"];
  input.entries.maxMainMembers = 5;
  input.entries.coordinatesRequested = true;
  input.entries.judgesCanViewCoordinates = true;
  input.voting.enabled = true;
  input.voting.minimumActiveMinutes = 240;
  input.voting.judgesCanVote = true;
  input.voting.showTotalsPublicWhileOpen = true;
  input.moderation.requireStaffApproval = false;
  input.moderation.openAIModeration = false;

  const sanitized = sanitizeCompetitionConfig(input);
  assert.ok(sanitized);
  assert.equal(sanitized.appearance.accent, "#A1B2C3");
  assert.deepEqual(sanitized.entries.allowedTypes, ["SOLO", "GROUP"]);
  assert.equal(sanitized.entries.maxMainMembers, 5);
  assert.equal(sanitized.voting.minimumActiveMinutes, 240);
  assert.equal(sanitized.voting.judgesCanVote, false);
  assert.equal(sanitized.voting.showTotalsPublicWhileOpen, false);
  assert.equal(sanitized.moderation.requireStaffApproval, true);
  assert.equal(sanitized.moderation.openAIModeration, true);
});

test("editor config rejects unsupported appearance and judging definitions", () => {
  const badAccent = initialCompetitionConfig();
  badAccent.appearance.accent = "red";
  assert.equal(sanitizeCompetitionConfig(badAccent), null);

  const badCriteria = initialCompetitionConfig();
  badCriteria.judging.criteria = [
    { id: "creativity", label: "Creativity", maxScore: 5, weight: 1 }
  ];
  assert.equal(sanitizeCompetitionConfig(badCriteria), null);
});
