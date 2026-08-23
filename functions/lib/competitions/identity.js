import { isCanonicalUuid } from "../validation.js";

const SESSION_COOKIE = "__Host-enthusia_competition_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const LINK_CODE_TTL_SECONDS = 5 * 60;
const LINK_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function requireDatabase(db) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("Competition database binding is unavailable");
  return db;
}

function requireWritableDatabase(db) {
  const database = requireDatabase(db);
  if (typeof database.batch !== "function") throw new TypeError("Competition database binding is not writable");
  return database;
}

function timestamp(value) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError("Identity timestamp is invalid");
  return parsed;
}

function isoAfter(now, seconds) {
  return new Date(timestamp(now) + seconds * 1000).toISOString();
}

function base64Url(bytes) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomIdentityToken(byteLength = 32) {
  if (!Number.isInteger(byteLength) || byteLength < 16 || byteLength > 64) {
    throw new TypeError("Identity token length is invalid");
  }
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function identityHash(value) {
  if (typeof value !== "string" || !value) throw new TypeError("Identity value is invalid");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return base64Url(digest);
}

function parseCookies(request) {
  const header = request?.headers?.get?.("cookie") ?? "";
  const cookies = new Map();
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) cookies.set(name, value);
  }
  return cookies;
}

export function competitionSessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  if (typeof token !== "string" || !token) throw new TypeError("Session token is invalid");
  const seconds = Number.isInteger(maxAge) ? Math.max(0, maxAge) : SESSION_TTL_SECONDS;
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}

export function clearCompetitionSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function safeReturnTo(value) {
  if (typeof value !== "string" || !value.startsWith("/competitions")) return "/competitions/";
  if (value.includes("\\") || value.includes("\r") || value.includes("\n") || value.startsWith("//")) return "/competitions/";
  return value.slice(0, 500);
}

export async function createOAuthState(db, returnTo, now = new Date()) {
  const database = requireDatabase(db);
  const state = randomIdentityToken(32);
  const stateHash = await identityHash(state);
  const createdAt = new Date(timestamp(now)).toISOString();
  const expiresAt = isoAfter(now, OAUTH_STATE_TTL_SECONDS);
  await database.prepare(`
    INSERT INTO competition_oauth_states (state_hash, return_to, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).bind(stateHash, safeReturnTo(returnTo), createdAt, expiresAt).run();
  return { state, expiresAt };
}

export async function consumeOAuthState(db, state, now = new Date()) {
  const database = requireDatabase(db);
  const stateHash = await identityHash(state);
  const nowIso = new Date(timestamp(now)).toISOString();
  const row = await database.prepare(`
    SELECT return_to AS returnTo
    FROM competition_oauth_states
    WHERE state_hash = ?
      AND expires_at > ?
    LIMIT 1
  `).bind(stateHash, nowIso).first();
  if (!row) return null;
  const deleted = await database.prepare(`
    DELETE FROM competition_oauth_states
    WHERE state_hash = ?
      AND expires_at > ?
  `).bind(stateHash, nowIso).run();
  if (Number(deleted?.meta?.changes ?? 0) !== 1) return null;
  return { returnTo: safeReturnTo(row.returnTo) };
}

function normalizeDiscordUser(raw) {
  const id = String(raw?.id ?? "").trim();
  const username = String(raw?.username ?? "").trim();
  const globalName = raw?.global_name === null || raw?.global_name === undefined
    ? null
    : String(raw.global_name).trim().slice(0, 80) || null;
  const avatarHash = raw?.avatar === null || raw?.avatar === undefined
    ? null
    : String(raw.avatar).trim().slice(0, 128) || null;
  if (!/^\d{16,22}$/.test(id) || !username || username.length > 80) return null;
  return { id, username: username.slice(0, 80), globalName, avatarHash };
}

export async function createIdentitySession(db, rawDiscordUser, now = new Date()) {
  const database = requireWritableDatabase(db);
  const user = normalizeDiscordUser(rawDiscordUser);
  if (!user) throw new TypeError("Discord user identity is invalid");
  const token = randomIdentityToken(32);
  const sessionHash = await identityHash(token);
  const createdAt = new Date(timestamp(now)).toISOString();
  const expiresAt = isoAfter(now, SESSION_TTL_SECONDS);
  await database.batch([
    database.prepare(`
      INSERT INTO competition_discord_accounts (
        discord_user_id, username, global_name, avatar_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(discord_user_id) DO UPDATE SET
        username = excluded.username,
        global_name = excluded.global_name,
        avatar_hash = excluded.avatar_hash,
        updated_at = excluded.updated_at
    `).bind(user.id, user.username, user.globalName, user.avatarHash, createdAt, createdAt),
    database.prepare(`
      INSERT INTO competition_identity_sessions (
        session_hash, discord_user_id, created_at, expires_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(sessionHash, user.id, createdAt, expiresAt, createdAt)
  ]);
  return { token, expiresAt, user };
}

export async function listDiscordMinecraftLinks(db, discordUserId) {
  const database = requireDatabase(db);
  const result = await database.prepare(`
    SELECT
      minecraft_uuid AS uuid,
      minecraft_name AS name,
      linked_at AS linkedAt,
      updated_at AS updatedAt
    FROM competition_minecraft_links
    WHERE discord_user_id = ?
    ORDER BY linked_at ASC, minecraft_uuid ASC
  `).bind(discordUserId).all();
  return Array.isArray(result?.results) ? result.results : [];
}

export async function getCompetitionIdentitySession(request, db, now = new Date()) {
  const database = requireDatabase(db);
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (!token) return null;
  let sessionHash;
  try {
    sessionHash = await identityHash(token);
  } catch {
    return null;
  }
  const nowIso = new Date(timestamp(now)).toISOString();
  const row = await database.prepare(`
    SELECT
      s.discord_user_id AS discordUserId,
      s.expires_at AS expiresAt,
      a.username,
      a.global_name AS globalName,
      a.avatar_hash AS avatarHash
    FROM competition_identity_sessions s
    JOIN competition_discord_accounts a ON a.discord_user_id = s.discord_user_id
    WHERE s.session_hash = ?
      AND s.expires_at > ?
    LIMIT 1
  `).bind(sessionHash, nowIso).first();
  if (!row) return null;
  await database.prepare(`
    UPDATE competition_identity_sessions
    SET last_seen_at = ?
    WHERE session_hash = ?
      AND last_seen_at < ?
  `).bind(nowIso, sessionHash, new Date(timestamp(now) - 15 * 60 * 1000).toISOString()).run().catch(() => {});
  const links = await listDiscordMinecraftLinks(database, row.discordUserId);
  return Object.freeze({
    subject: `discord:${row.discordUserId}`,
    discord: Object.freeze({
      id: row.discordUserId,
      username: row.username,
      globalName: row.globalName,
      avatarHash: row.avatarHash
    }),
    linkedMinecraftAccounts: Object.freeze(links.map((link) => Object.freeze({ ...link }))),
    expiresAt: row.expiresAt,
    sessionHash
  });
}

export async function deleteCompetitionIdentitySession(request, db) {
  const database = requireDatabase(db);
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (!token) return false;
  const sessionHash = await identityHash(token);
  const result = await database.prepare(
    "DELETE FROM competition_identity_sessions WHERE session_hash = ?"
  ).bind(sessionHash).run();
  return Number(result?.meta?.changes ?? 0) === 1;
}

function randomLinkCode(length = 8) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) code += LINK_CODE_ALPHABET[byte % LINK_CODE_ALPHABET.length];
  return code;
}

export async function createMinecraftLinkCode(db, discordUserId, now = new Date()) {
  const database = requireWritableDatabase(db);
  const createdAt = new Date(timestamp(now)).toISOString();
  const expiresAt = isoAfter(now, LINK_CODE_TTL_SECONDS);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomLinkCode();
    const codeHash = await identityHash(code);
    try {
      await database.batch([
        database.prepare(`
          DELETE FROM competition_link_codes
          WHERE discord_user_id = ?
            AND consumed_at IS NULL
        `).bind(discordUserId),
        database.prepare(`
          INSERT INTO competition_link_codes (
            code_hash, discord_user_id, created_at, expires_at, consumed_at
          ) VALUES (?, ?, ?, ?, NULL)
        `).bind(codeHash, discordUserId, createdAt, expiresAt)
      ]);
      return { code, codeHash, expiresAt };
    } catch (error) {
      if (!String(error?.message ?? error).includes("UNIQUE")) throw error;
    }
  }
  throw new Error("Unable to allocate a unique Minecraft link code");
}

export async function getActiveLinkCode(db, discordUserId, codeHash, now = new Date()) {
  const database = requireDatabase(db);
  const nowIso = new Date(timestamp(now)).toISOString();
  return database.prepare(`
    SELECT code_hash AS codeHash, expires_at AS expiresAt
    FROM competition_link_codes
    WHERE code_hash = ?
      AND discord_user_id = ?
      AND consumed_at IS NULL
      AND expires_at > ?
    LIMIT 1
  `).bind(codeHash, discordUserId, nowIso).first();
}

export async function consumeMinecraftLinkCode(db, {
  discordUserId,
  codeHash,
  minecraftUuid,
  minecraftName,
  now = new Date()
}) {
  const database = requireWritableDatabase(db);
  const uuid = String(minecraftUuid ?? "").trim().toLowerCase();
  const name = String(minecraftName ?? "").trim();
  if (!isCanonicalUuid(uuid) || !/^[A-Za-z0-9_]{1,16}$/.test(name)) {
    throw new TypeError("Minecraft link identity is invalid");
  }
  const nowIso = new Date(timestamp(now)).toISOString();
  const active = await getActiveLinkCode(database, discordUserId, codeHash, now);
  if (!active) return { status: "CODE_EXPIRED_OR_USED" };

  const existing = await database.prepare(`
    SELECT discord_user_id AS discordUserId
    FROM competition_minecraft_links
    WHERE minecraft_uuid = ?
    LIMIT 1
  `).bind(uuid).first();
  if (existing && existing.discordUserId !== discordUserId) {
    return { status: "MINECRAFT_ALREADY_LINKED" };
  }

  const results = await database.batch([
    database.prepare(`
      INSERT INTO competition_minecraft_links (
        minecraft_uuid, discord_user_id, minecraft_name, linked_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(minecraft_uuid) DO UPDATE SET
        minecraft_name = excluded.minecraft_name,
        updated_at = excluded.updated_at
      WHERE competition_minecraft_links.discord_user_id = excluded.discord_user_id
    `).bind(uuid, discordUserId, name, nowIso, nowIso),
    database.prepare(`
      UPDATE competition_link_codes
      SET consumed_at = ?
      WHERE code_hash = ?
        AND discord_user_id = ?
        AND consumed_at IS NULL
        AND expires_at > ?
        AND EXISTS (
          SELECT 1 FROM competition_minecraft_links
          WHERE minecraft_uuid = ? AND discord_user_id = ?
        )
    `).bind(nowIso, codeHash, discordUserId, nowIso, uuid, discordUserId)
  ]);
  if (Number(results?.[1]?.meta?.changes ?? 0) !== 1) return { status: "CONFLICT" };
  return { status: existing ? "ALREADY_LINKED_TO_YOU" : "LINKED", uuid, name };
}

export async function unlinkMinecraftAccount(db, discordUserId, minecraftUuid) {
  const database = requireDatabase(db);
  const uuid = String(minecraftUuid ?? "").trim().toLowerCase();
  if (!isCanonicalUuid(uuid)) return false;
  const result = await database.prepare(`
    DELETE FROM competition_minecraft_links
    WHERE discord_user_id = ?
      AND minecraft_uuid = ?
  `).bind(discordUserId, uuid).run();
  return Number(result?.meta?.changes ?? 0) === 1;
}

export async function pruneCompetitionIdentityState(db, now = new Date()) {
  const database = requireWritableDatabase(db);
  const nowIso = new Date(timestamp(now)).toISOString();
  const results = await database.batch([
    database.prepare("DELETE FROM competition_oauth_states WHERE expires_at <= ?").bind(nowIso),
    database.prepare("DELETE FROM competition_identity_sessions WHERE expires_at <= ?").bind(nowIso),
    database.prepare("DELETE FROM competition_link_codes WHERE expires_at <= ? OR consumed_at IS NOT NULL").bind(nowIso)
  ]);
  return results.map((result) => Number(result?.meta?.changes ?? 0));
}

export {
  LINK_CODE_TTL_SECONDS,
  OAUTH_STATE_TTL_SECONDS,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  normalizeDiscordUser,
  safeReturnTo
};
