import assert from "node:assert/strict";
import test from "node:test";

import {
  competitionSlug,
  initialCompetitionConfig,
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
