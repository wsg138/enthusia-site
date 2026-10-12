import assert from "node:assert/strict";
import test from "node:test";
import { d1, migratedDatabase } from "./support/d1-sqlite.mjs";
import { normalizeNetworkAccounts, refreshNetworkAccounts } from "../functions/lib/competitions/network-accounts.js";

const USER = "111111111111111111";
const OTHER = "222222222222222222";
const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";
const NOW = "2026-10-12T12:00:00.000Z";
const ENV = { STAFF_API_TARGET: "production", STAFF_API_BEARER_TOKEN: "b".repeat(40), STAFF_API_HMAC_SECRET: "h".repeat(40) };

async function database() {
  const db = await migratedDatabase();
  for (const id of [USER, OTHER]) db.prepare("INSERT INTO competition_discord_accounts (discord_user_id, username, created_at, updated_at) VALUES (?, 'Player', ?, ?)").run(id, NOW, NOW);
  return db;
}

function link(db, uuid, owner) {
  db.prepare("INSERT INTO competition_minecraft_links VALUES (?, ?, 'Player', ?, ?)").run(uuid, owner, NOW, NOW);
}

test("network identities reject malformed or duplicate records instead of accepting a partial list", () => {
  const account = { uuid: A, name: "P2wn", linkedAt: NOW };
  assert.deepEqual(normalizeNetworkAccounts({ accounts: [account] }), [account]);
  for (const accounts of [null, [account, account], [{ ...account, uuid: "bad" }], [{ ...account, linkedAt: "bad" }], [{ ...account, name: "<script>" }]]) {
    assert.throws(() => normalizeNetworkAccounts({ accounts }));
  }
});

test("authoritative refresh updates only the verified user's projection and signs that identity", async (t) => {
  const db = await database();
  t.after(() => db.close());
  link(db, A, USER);
  link(db, B, OTHER);
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://staff-network-api.enthusia.info/v1/website/accounts");
    assert.deepEqual(JSON.parse(new TextDecoder().decode(options.body)), { discordUserId: USER });
    assert.ok(options.headers["x-enthusia-signature"]);
    return Response.json({ accounts: [] });
  });
  await refreshNetworkAccounts(d1(db), ENV, USER);
  assert.equal(db.prepare("SELECT count(*) AS n FROM competition_minecraft_links WHERE discord_user_id = ?").get(USER).n, 0);
  assert.equal(db.prepare("SELECT discord_user_id AS owner FROM competition_minecraft_links WHERE minecraft_uuid = ?").get(B).owner, OTHER);
});

test("a network outage preserves cached ownership and refuses to authenticate from stale data", async (t) => {
  const db = await database();
  t.after(() => db.close());
  link(db, A, USER);
  t.mock.method(globalThis, "fetch", async () => new Response("Unavailable", { status: 503 }));
  await assert.rejects(refreshNetworkAccounts(d1(db), ENV, USER));
  assert.equal(db.prepare("SELECT discord_user_id AS owner FROM competition_minecraft_links WHERE minecraft_uuid = ?").get(A).owner, USER);
});

test("competition history locks reject reassignment and roll back the entire refreshed projection", async (t) => {
  const db = await database();
  t.after(() => db.close());
  link(db, A, USER);
  link(db, B, OTHER);
  db.prepare("INSERT INTO competition_minecraft_identity_locks VALUES (?, ?, ?, 'EXISTING_HISTORY')").run(B, OTHER, NOW);
  t.mock.method(globalThis, "fetch", async () => Response.json({ accounts: [{ uuid: B, name: "Player", linkedAt: NOW }] }));
  await assert.rejects(refreshNetworkAccounts(d1(db), ENV, USER), /minecraft_identity_locked/);
  assert.equal(db.prepare("SELECT discord_user_id AS owner FROM competition_minecraft_links WHERE minecraft_uuid = ?").get(A).owner, USER);
  assert.equal(db.prepare("SELECT discord_user_id AS owner FROM competition_minecraft_links WHERE minecraft_uuid = ?").get(B).owner, OTHER);
});
