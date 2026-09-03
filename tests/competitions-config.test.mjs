import assert from "node:assert/strict";
import test from "node:test";

import {
  competitionSlug,
  initialCompetitionConfig,
  sanitizeCompetitionConfig,
  sanitizeDraftCompetition
} from "../functions/lib/competitions/config.js";
import { isSafeIdentifier } from "../functions/lib/validation.js";

test("safe identifiers enforce explicit length and character policies", () => {
  assert.equal(isSafeIdentifier("media:summer-2026"), true);
  assert.equal(isSafeIdentifier("competition.submit", { minLength: 3, maxLength: 64, allowColon: false }), true);
  assert.equal(isSafeIdentifier("competition:submit", { allowColon: false }), false);
  assert.equal(isSafeIdentifier("bad identifier"), false);
  assert.equal(isSafeIdentifier("x", { minLength: 2 }), false);
});

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

test("editor config rejects malformed timestamps, numbers, booleans, and entry types", () => {
  const badTime = initialCompetitionConfig();
  badTime.schedule.submissionsOpenAt = "not-a-date";
  assert.equal(sanitizeCompetitionConfig(badTime), null);

  const badNumber = initialCompetitionConfig();
  badNumber.voting.minimumActiveMinutes = "120";
  assert.equal(sanitizeCompetitionConfig(badNumber), null);

  const badBoolean = initialCompetitionConfig();
  badBoolean.entries.coordinatesRequested = "true";
  assert.equal(sanitizeCompetitionConfig(badBoolean), null);

  const badEntryType = initialCompetitionConfig();
  badEntryType.entries.allowedTypes = ["SOLO", "UNKNOWN"];
  assert.equal(sanitizeCompetitionConfig(badEntryType), null);
});

test("editor config normalizes every configurable section", () => {
  const input = initialCompetitionConfig({ summary: "  Summer build  " });
  input.public.description = "Line one\r\nLine two";
  input.appearance.bannerImageId = "banner:summer-2026";
  input.schedule.submissionsOpenAt = "2026-09-01T12:00:00-04:00";
  input.entries.guildSubmissionPermission = " Competition.Submit ";
  input.judging.enabled = true;
  input.judging.criteria = [
    { id: "creativity", label: "  Creativity  ", maxScore: 10, weight: 2 }
  ];
  input.judging.communityWeight = 40;
  input.judging.judgeWeight = 60;
  input.judging.tiebreakRule = "HIGHEST_JUDGE_SCORE";
  input.moderation.reviewGraceMinutes = 720;

  const sanitized = sanitizeCompetitionConfig(input);
  assert.ok(sanitized);
  assert.equal(sanitized.public.summary, "Summer build");
  assert.equal(sanitized.public.description, "Line one\nLine two");
  assert.equal(sanitized.appearance.bannerImageId, "banner:summer-2026");
  assert.equal(sanitized.schedule.submissionsOpenAt, "2026-09-01T16:00:00.000Z");
  assert.equal(sanitized.entries.guildSubmissionPermission, "competition.submit");
  assert.deepEqual(sanitized.judging.criteria, [
    { id: "creativity", label: "Creativity", maxScore: 10, weight: 2 }
  ]);
  assert.equal(sanitized.judging.tiebreakRule, "HIGHEST_JUDGE_SCORE");
  assert.equal(sanitized.moderation.reviewGraceMinutes, 720);
});

test("editor config rejects malformed section containers", () => {
  assert.equal(sanitizeCompetitionConfig([]), null);
  assert.equal(sanitizeCompetitionConfig({ schemaVersion: 2 }), null);

  for (const section of [
    "public",
    "appearance",
    "schedule",
    "entries",
    "voting",
    "judging",
    "rewards",
    "moderation"
  ]) {
    const input = initialCompetitionConfig();
    input[section] = [];
    assert.equal(sanitizeCompetitionConfig(input), null, `${section} must be an object`);
  }
});
