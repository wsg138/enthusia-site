import assert from "node:assert/strict";
import test from "node:test";

import {
  competitionDiscordConfigured,
  deliverCompetitionDiscordNotification,
  discordRetryAt,
  reviewUrl,
  webhookPayload
} from "../functions/lib/competitions/discord-notifications.js";

const notification = {
  id: "notification-1",
  competitionId: "123e4567-e89b-42d3-a456-426614174000",
  submissionId: "123e4567-e89b-42d3-a456-426614174001",
  eventType: "SUBMISSION_REVIEW",
  createdAt: "2026-08-23T03:00:00.000Z",
  payload: {
    competitionTitle: "Summer Build",
    competitionSlug: "summer-build",
    submissionTitle: "Castle",
    ownerName: "Builder"
  }
};

function env() {
  return {
    COMPETITIONS_SITE_ORIGIN: "https://preview.enthusia.info",
    COMPETITIONS_DISCORD_STAFF_WEBHOOK: "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz123456",
    COMPETITIONS_DISCORD_STAFF_ROLE_ID: "234567890123456789"
  };
}

test("Discord notification configuration is fail-closed and host-restricted", () => {
  assert.equal(competitionDiscordConfigured({}), false);
  assert.equal(competitionDiscordConfigured(env()), true);
  assert.equal(competitionDiscordConfigured({
    ...env(),
    COMPETITIONS_DISCORD_STAFF_WEBHOOK: "https://example.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz123456"
  }), false);
});

test("staff review links contain only opaque IDs and no private submission data", () => {
  const url = reviewUrl(env(), notification);
  assert.equal(
    url,
    "https://preview.enthusia.info/competitions/admin/?competition=123e4567-e89b-42d3-a456-426614174000&section=review&submission=123e4567-e89b-42d3-a456-426614174001"
  );
  assert.equal(url.includes("Builder"), false);
  assert.equal(url.includes("world"), false);
});

test("Discord staff ping explicitly whitelists only the configured role", () => {
  const payload = webhookPayload(env(), notification, {
    roleId: "234567890123456789"
  });
  assert.equal(payload.content.startsWith("<@&234567890123456789>"), true);
  assert.deepEqual(payload.allowed_mentions, { parse: [], roles: ["234567890123456789"] });
  assert.equal(JSON.stringify(payload).includes("coordinates"), false);
});

test("Discord delivery accepts successful webhook response and never exposes webhook URL in output", async () => {
  let requestedUrl = null;
  let requestedBody = null;
  const result = await deliverCompetitionDiscordNotification(env(), notification, async (url, options) => {
    requestedUrl = url;
    requestedBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: "345678901234567890" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });
  assert.equal(result.status, "DELIVERED");
  assert.equal(result.messageId, "345678901234567890");
  assert.match(requestedUrl, /^https:\/\/discord\.com\/api\/webhooks\//);
  assert.equal(requestedBody.embeds[0].title, "Castle");
  assert.equal(JSON.stringify(result).includes("webhooks"), false);
});

test("Discord retry backoff is deterministic and capped", () => {
  const failedAt = "2026-08-23T03:00:00.000Z";
  assert.equal(discordRetryAt(failedAt, 1), "2026-08-23T03:00:15.000Z");
  assert.equal(discordRetryAt(failedAt, 2), "2026-08-23T03:00:30.000Z");
  assert.equal(discordRetryAt(failedAt, 99), "2026-08-23T04:00:00.000Z");
});
