import assert from "node:assert/strict";
import test from "node:test";
import { d1, migratedDatabase } from "./support/d1-sqlite.mjs";
import { normalizeNetworkAccounts, refreshNetworkAccounts } from "../functions/lib/competitions/network-accounts.js";
import { createIdentitySession } from "../functions/lib/competitions/identity.js";
import { getCompetitionParticipantSession, linkedMinecraftAccount } from "../functions/lib/competitions/participant-auth.js";
import { onRequestGet as sessionRoute } from "../functions/api/competitions/auth/session.js";

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
  for (const accounts of [null, [account, account], [{ ...account, uuid: "bad" }], [{ ...account, linkedAt: "bad" }], [{ ...account, name: "<script>" }], [{ ...account, name: "Player\nName" }], [{ ...account, name: " " }], [{ ...account, name: "a".repeat(33) }]]) {
    assert.throws(() => normalizeNetworkAccounts({ accounts }));
  }
});

test("authoritative names preserve Bedrock prefixes and full gamertags", () => {
  for (const name of ["*BedrockPlayer", "*" + "a".repeat(16), ".Bedrock Player"]) {
    const account = { uuid: A, name, linkedAt: NOW };
    assert.deepEqual(normalizeNetworkAccounts({ accounts: [account] }), [account]);
  }
});

test("verified Bedrock link remains selectable in an authenticated competition session", async (t) => {
  const database = await migratedDatabase();
  t.after(() => database.close());
  const db = d1(database);
  const identity = await createIdentitySession(db, { id: USER, username: "Builder", guildMember: true });
  t.mock.method(globalThis, "fetch", async () => Response.json({
    accounts: [{ uuid: A, name: ".Bedrock Player", linkedAt: NOW }]
  }));
  const request = new Request("https://enthusia.info/api/competitions/auth/session", {
    headers: { cookie: `__Host-enthusia_competition_session=${identity.token}` }
  });
  const session = await getCompetitionParticipantSession(request, db, { ...ENV, NETWORK_ACCOUNT_LINKS: "true" });
  assert.deepEqual(linkedMinecraftAccount(session, A), { uuid: A, name: ".Bedrock Player" });
  assert.equal(database.prepare("SELECT minecraft_name FROM competition_minecraft_links WHERE minecraft_uuid = ?").get(A).minecraft_name, ".Bedrock Player");
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

test("account display can show Discord during a network outage without trusting cached Minecraft ownership", async (t) => {
  const database = await migratedDatabase();
  t.after(() => database.close());
  const db = d1(database);
  const identity = await createIdentitySession(db, { id: USER, username: "Builder", guildMember: true });
  link(database, A, USER);
  t.mock.method(globalThis, "fetch", async () => new Response("Unavailable", { status: 503 }));
  const env = { ...ENV, NETWORK_ACCOUNT_LINKS: "true", COMPETITIONS_ENABLED: "true", COMPETITIONS_DB: db };
  const headers = { cookie: `__Host-enthusia_competition_session=${identity.token}` };
  const request = path => new Request(`https://enthusia.info/api/competitions/auth/session${path}`, { headers });
  const account = await sessionRoute({ env, request: request("?view=account") });
  assert.equal(account.status, 200);
  const data = await account.json();
  assert.equal(data.authenticated, true);
  assert.equal(data.discord.username, "Builder");
  assert.equal(data.networkAccountsUnavailable, true);
  assert.deepEqual(data.linkedMinecraftAccounts, []);
  assert.equal(database.prepare("SELECT discord_user_id AS owner FROM competition_minecraft_links WHERE minecraft_uuid = ?").get(A).owner, USER);
  assert.equal((await sessionRoute({ env, request: request("") })).status, 503);
  await assert.rejects(getCompetitionParticipantSession(request(""), db, env));
});

test("account display preserves verified accounts when the network service is healthy", async (t) => {
  const database = await migratedDatabase();
  t.after(() => database.close());
  const db = d1(database);
  const identity = await createIdentitySession(db, { id: USER, username: "Builder", guildMember: true });
  t.mock.method(globalThis, "fetch", async () => Response.json({ accounts: [{ uuid: A, name: "Builder", linkedAt: NOW }] }));
  const env = { ...ENV, NETWORK_ACCOUNT_LINKS: "true", COMPETITIONS_ENABLED: "true", COMPETITIONS_DB: db };
  const request = new Request("https://enthusia.info/api/competitions/auth/session?view=account", {
    headers: { cookie: `__Host-enthusia_competition_session=${identity.token}` }
  });
  const response = await sessionRoute({ env, request });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.networkAccountsUnavailable, false);
  assert.equal(data.linkedMinecraftAccounts[0].uuid, A);
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

test("competition editor distinguishes a linked-account outage from missing staff access", async (t) => {
  const { onRequest } = await import("../functions/competitions/admin/_middleware.js");
  const database = await migratedDatabase();
  t.after(() => database.close());
  const db = d1(database);
  const identity = await createIdentitySession(db, { id: USER, username: "Builder", guildMember: true });
  const env = { ...ENV, NETWORK_ACCOUNT_LINKS: "true", COMPETITIONS_ENABLED: "true", COMPETITIONS_DB: db };
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 503 }));
  const url = "https://enthusia.info/competitions/admin/";
  const next = () => assert.fail("Editor must stay protected");
  const visitor = await onRequest({ request: new Request(url), env, next });
  assert.equal(visitor.status, 404);
  const request = new Request(url, { headers: { cookie: `__Host-enthusia_competition_session=${identity.token}` } });
  const response = await onRequest({ request, env, next });
  assert.equal(response.status, 503);
  assert.match(await response.text(), /Minecraft account/i);
});
