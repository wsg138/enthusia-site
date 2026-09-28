import assert from "node:assert/strict";
import test from "node:test";

import { revalidationRateLimit } from "../functions/api/appeals/revalidate.js";
import { saveRevalidatedPunishmentBinding } from "../functions/lib/appeal-bindings.js";
import { revalidatePunishment, sanitizeRevalidationRequest } from "../functions/lib/appeal-revalidation.js";

const ACCOUNT_ID = "123e4567-e89b-42d3-a456-426614174001";
const PUNISHMENT_ID = "123e4567-e89b-42d3-a456-426614174099";
const ENV = {
  STAFF_API_BEARER_TOKEN: "b".repeat(32),
  STAFF_API_HMAC_SECRET: "s".repeat(32)
};
const BINDING = {
  punishmentId: PUNISHMENT_ID,
  caseId: "01ARZ3NDEKTSV4RR",
  codeGeneration: 4,
  punishmentType: "BAN",
  boundUsername: "Lincoln",
  eligible: true,
  eligibilityState: "ELIGIBLE"
};

function rateLimitDatabase() {
  let count = 0;
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async run() { return { meta: { changes: 0 } }; },
            async first() {
              assert.match(sql, /competition_rate_limits/);
              count += 1;
              return { requestCount: count };
            }
          };
        }
      };
    }
  };
}

function bindingDatabase(initialGeneration = 4) {
  const row = {
    punishmentId: PUNISHMENT_ID,
    caseId: BINDING.caseId,
    codeGeneration: initialGeneration,
    punishmentType: "BAN",
    boundUsername: "Lincoln",
    eligible: 1,
    eligibilityState: "ELIGIBLE",
    createdAt: "2026-09-28T00:00:00.000Z",
    updatedAt: "2026-09-28T00:00:00.000Z",
    lastValidatedAt: "2026-09-28T00:00:00.000Z"
  };
  return {
    row,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              assert.match(sql, /UPDATE appeal_punishment_bindings/);
              if (!values[1]) row.codeGeneration = values[2];
              row.caseId = values[0];
              row.punishmentType = values[3];
              row.boundUsername = values[4];
              row.eligible = values[5];
              row.eligibilityState = values[6];
              row.updatedAt = values[7];
              row.lastValidatedAt = values[8];
              return { meta: { changes: 1 } };
            },
            async first() {
              assert.match(sql, /SELECT punishment_id AS punishmentId/);
              return row;
            }
          };
        }
      };
    }
  };
}

test("revalidation only accepts an owned punishment identifier from the browser", () => {
  assert.deepEqual(sanitizeRevalidationRequest({ punishmentId: PUNISHMENT_ID }), { punishmentId: PUNISHMENT_ID });
  assert.equal(sanitizeRevalidationRequest({ punishmentId: PUNISHMENT_ID, accountId: ACCOUNT_ID }), null);
  assert.equal(sanitizeRevalidationRequest({ punishmentId: PUNISHMENT_ID, codeGeneration: 99 }), null);
  assert.equal(sanitizeRevalidationRequest({ punishmentId: "invalid" }), null);
});

test("Staff revalidation uses server-owned account and generation values", async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options };
    return new Response(JSON.stringify(BINDING), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await revalidatePunishment(ENV, ACCOUNT_ID, BINDING);
    const body = JSON.parse(new TextDecoder().decode(captured.options.body));
    assert.equal(captured.url, "https://staff-api.enthusia.info/v1/website/punishment-codes/revalidate");
    assert.deepEqual(body, { accountId: ACCOUNT_ID, punishmentId: PUNISHMENT_ID, codeGeneration: 4 });
    assert.equal("punishmentCode" in body, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rotated-code revalidation preserves the last claimed generation", async () => {
  const db = bindingDatabase(4);
  const saved = await saveRevalidatedPunishmentBinding(db, "3".repeat(18), {
    ...BINDING,
    codeGeneration: 5,
    eligible: false,
    eligibilityState: "CODE_ROTATED"
  }, new Date("2026-09-28T01:00:00.000Z"));
  assert.equal(saved.codeGeneration, 4);
  assert.equal(saved.eligibilityState, "CODE_ROTATED");
  assert.equal(saved.eligible, false);
});

test("revalidation is account-keyed and rate limited", async () => {
  const context = { env: { COMPETITIONS_DB: rateLimitDatabase() } };
  const session = { subject: `discord:${"3".repeat(18)}` };
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    assert.equal(await revalidationRateLimit(context, session), null);
  }
  const blocked = await revalidationRateLimit(context, session);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("x-ratelimit-limit"), "12");
});
