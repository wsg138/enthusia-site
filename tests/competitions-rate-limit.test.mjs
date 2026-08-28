import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { competitionRateLimit, rateLimitHeaders } from "../functions/lib/competitions/rate-limit.js";

const DISCORD_A = `discord:${"1".repeat(18)}`;
const DISCORD_B = `discord:${"2".repeat(18)}`;

function d1(database) {
  return {
    prepare(sql) {
      let statement;
      let params = [];
      return {
        bind(...values) {
          params = values;
          statement = database.prepare(sql);
          return this;
        },
        async run() {
          const result = statement.run(...params);
          return { meta: { changes: Number(result.changes ?? 0) } };
        },
        async first() {
          return statement.get(...params) ?? null;
        }
      };
    }
  };
}

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  const directory = new URL("../migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
    database.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  }
  return database;
}

test("competition rate limiter allows up to the configured count and then throttles", async () => {
  const database = await migratedDatabase();
  const db = d1(database);
  const now = Date.parse("2026-08-23T04:00:00.000Z");
  const first = await competitionRateLimit(db, { scope: "image-upload", identity: DISCORD_A, limit: 2, windowSeconds: 60, now });
  const second = await competitionRateLimit(db, { scope: "image-upload", identity: DISCORD_A, limit: 2, windowSeconds: 60, now: now + 1000 });
  const third = await competitionRateLimit(db, { scope: "image-upload", identity: DISCORD_A, limit: 2, windowSeconds: 60, now: now + 2000 });
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  assert.equal(third.remaining, 0);
  assert.equal(rateLimitHeaders(third)["retry-after"], "58");
  database.close();
});

test("competition rate limiter isolates identities and resets on the next window", async () => {
  const database = await migratedDatabase();
  const db = d1(database);
  const now = Date.parse("2026-08-23T04:00:00.000Z");
  await competitionRateLimit(db, { scope: "vote", identity: DISCORD_A, limit: 1, windowSeconds: 60, now });
  const other = await competitionRateLimit(db, { scope: "vote", identity: DISCORD_B, limit: 1, windowSeconds: 60, now: now + 1000 });
  const nextWindow = await competitionRateLimit(db, { scope: "vote", identity: DISCORD_A, limit: 1, windowSeconds: 60, now: now + 61_000 });
  assert.equal(other.allowed, true);
  assert.equal(nextWindow.allowed, true);
  assert.equal(nextWindow.requestCount, 1);
  database.close();
});
