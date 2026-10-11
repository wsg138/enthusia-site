import assert from "node:assert/strict";
import test from "node:test";

import { claimRateLimit } from "../functions/api/appeals/claim.js";
import {
  sanitizeTurnstileToken,
  turnstileSiteKey,
  verifyTurnstile
} from "../functions/lib/turnstile.js";

function rateLimitDatabase() {
  let count = 0;
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async run() {
              assert.match(sql, /DELETE FROM competition_rate_limits/);
              return { meta: { changes: 0 } };
            },
            async first() {
              assert.match(sql, /INSERT INTO competition_rate_limits/);
              count += 1;
              return { requestCount: count };
            }
          };
        }
      };
    }
  };
}

test("punishment-code claims are account-keyed and limited to eight attempts per window", async () => {
  const context = { env: { COMPETITIONS_DB: rateLimitDatabase() } };
  const session = { subject: `discord:${"3".repeat(18)}` };

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    assert.equal(await claimRateLimit(context, session), null);
  }
  const blocked = await claimRateLimit(context, session);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("x-ratelimit-limit"), "8");
  assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
});

test("Turnstile configuration and tokens fail closed when malformed", () => {
  assert.equal(turnstileSiteKey({ TURNSTILE_SITE_KEY: "1x00000000000000000000AA" }), "1x00000000000000000000AA");
  assert.throws(() => turnstileSiteKey({}), /not configured/);
  assert.equal(sanitizeTurnstileToken(" valid-token "), "valid-token");
  assert.equal(sanitizeTurnstileToken(""), null);
  assert.equal(sanitizeTurnstileToken("x".repeat(2049)), null);
});

test("Turnstile verification requires Siteverify success and the expected action", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return new Response(JSON.stringify({ success: true, action: "appeal_claim" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const env = { TURNSTILE_SECRET_KEY: "secret-key-long-enough-for-test" };
    assert.equal(await verifyTurnstile(env, "token-1", { action: "appeal_claim" }), true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const body = JSON.parse(requests[0].options.body);
    assert.equal(body.secret, env.TURNSTILE_SECRET_KEY);
    assert.equal(body.response, "token-1");
    assert.match(body.idempotency_key, /^[0-9a-f-]{36}$/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Turnstile action mismatch is rejected", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, action: "other_action" }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
  try {
    assert.equal(await verifyTurnstile(
      { TURNSTILE_SECRET_KEY: "secret-key-long-enough-for-test" },
      "token-2",
      { action: "appeal_claim" }
    ), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
