const EMAIL_SESSION_COOKIE = "__Host-enthusia_appeal_email_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const VERIFICATION_TTL_SECONDS = 24 * 60 * 60;
const PASSWORD_ITERATIONS = 310_000;
const encoder = new TextEncoder();

function database(db) {
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new TypeError("Appeal email database is unavailable");
  }
  return db;
}

function base64Url(bytes) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlBytes(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomToken(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256(value) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

function timestamp(now) {
  const value = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(value)) throw new TypeError("Appeal email timestamp is invalid");
  return value;
}

function isoAfter(now, seconds) {
  return new Date(timestamp(now) + seconds * 1000).toISOString();
}

export function normalizeAppealEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 5 || email.length > 254) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(email)) return null;
  return email;
}

export function validAppealPassword(value) {
  return typeof value === "string" && value.length >= 12 && value.length <= 128;
}

async function derivePassword(password, salt, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: base64UrlBytes(salt),
    iterations
  }, key, 256);
  return base64Url(new Uint8Array(bits));
}

function equalEncoded(left, right) {
  let a;
  let b;
  try {
    a = base64UrlBytes(left);
    b = base64UrlBytes(right);
  } catch {
    return false;
  }
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function passwordMaterial(password) {
  const salt = randomToken(16);
  return Object.freeze({
    salt,
    hash: await derivePassword(password, salt),
    iterations: PASSWORD_ITERATIONS
  });
}

export async function registerAppealEmailAccount(db, input, now = new Date()) {
  const store = database(db);
  const email = normalizeAppealEmail(input?.email);
  if (!email || !validAppealPassword(input?.password)) throw new TypeError("Appeal email registration is invalid");
  const existing = await store.prepare(`
    SELECT account_id AS accountId, verified_at AS verifiedAt
    FROM appeal_email_accounts WHERE email = ? LIMIT 1
  `).bind(email).first();
  if (existing?.verifiedAt) return Object.freeze({ accepted: true, email, verificationToken: null });

  const accountId = existing?.accountId ?? crypto.randomUUID();
  const password = await passwordMaterial(input.password);
  const verificationToken = randomToken(32);
  const tokenHash = await sha256(verificationToken);
  const createdAt = new Date(timestamp(now)).toISOString();
  const expiresAt = isoAfter(now, VERIFICATION_TTL_SECONDS);
  await store.batch([
    store.prepare(`
      INSERT INTO appeal_email_accounts (
        account_id, email, password_salt, password_hash, password_iterations,
        verified_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        password_salt = excluded.password_salt,
        password_hash = excluded.password_hash,
        password_iterations = excluded.password_iterations,
        updated_at = excluded.updated_at
      WHERE appeal_email_accounts.verified_at IS NULL
    `).bind(accountId, email, password.salt, password.hash, password.iterations, createdAt, createdAt),
    store.prepare("DELETE FROM appeal_email_verifications WHERE account_id = ? AND consumed_at IS NULL")
      .bind(accountId),
    store.prepare(`
      INSERT INTO appeal_email_verifications (token_hash, account_id, created_at, expires_at, consumed_at)
      VALUES (?, ?, ?, ?, NULL)
    `).bind(tokenHash, accountId, createdAt, expiresAt)
  ]);
  return Object.freeze({ accepted: true, email, verificationToken, expiresAt });
}

export async function verifyAppealEmailAccount(db, token, now = new Date()) {
  const store = database(db);
  if (typeof token !== "string" || token.length < 32 || token.length > 128) return false;
  const tokenHash = await sha256(token);
  const nowIso = new Date(timestamp(now)).toISOString();
  const record = await store.prepare(`
    SELECT account_id AS accountId
    FROM appeal_email_verifications
    WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?
    LIMIT 1
  `).bind(tokenHash, nowIso).first();
  if (!record) return false;
  const results = await store.batch([
    store.prepare(`
      UPDATE appeal_email_verifications SET consumed_at = ?
      WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?
    `).bind(nowIso, tokenHash, nowIso),
    store.prepare(`
      UPDATE appeal_email_accounts SET verified_at = COALESCE(verified_at, ?), updated_at = ?
      WHERE account_id = ?
    `).bind(nowIso, nowIso, record.accountId)
  ]);
  return Number(results?.[0]?.meta?.changes ?? 0) === 1
    && Number(results?.[1]?.meta?.changes ?? 0) === 1;
}

async function verifiedAccountForPassword(store, email, password) {
  const row = await store.prepare(`
    SELECT account_id AS accountId, email, password_salt AS passwordSalt,
           password_hash AS passwordHash, password_iterations AS passwordIterations,
           verified_at AS verifiedAt
    FROM appeal_email_accounts WHERE email = ? LIMIT 1
  `).bind(email).first();
  const salt = row?.passwordSalt ?? "AAAAAAAAAAAAAAAAAAAAAA";
  const iterations = Number(row?.passwordIterations ?? PASSWORD_ITERATIONS);
  const candidate = await derivePassword(password, salt, iterations);
  if (!row?.verifiedAt || !equalEncoded(candidate, row.passwordHash)) return null;
  return row;
}

export async function loginAppealEmailAccount(db, input, now = new Date()) {
  const store = database(db);
  const email = normalizeAppealEmail(input?.email);
  if (!email || !validAppealPassword(input?.password)) return null;
  const account = await verifiedAccountForPassword(store, email, input.password);
  if (!account) return null;
  const sessionToken = randomToken(32);
  const sessionHash = await sha256(sessionToken);
  const createdAt = new Date(timestamp(now)).toISOString();
  const expiresAt = isoAfter(now, SESSION_TTL_SECONDS);
  await store.prepare(`
    INSERT INTO appeal_email_sessions (session_hash, account_id, created_at, expires_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(sessionHash, account.accountId, createdAt, expiresAt, createdAt).run();
  return Object.freeze({ sessionToken, expiresAt, accountId: account.accountId, email: account.email });
}

function cookies(request) {
  const result = new Map();
  for (const part of (request?.headers?.get?.("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0) result.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  return result;
}

export function appealEmailSessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return `${EMAIL_SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, maxAge)}`;
}

export function clearAppealEmailSessionCookie() {
  return appealEmailSessionCookie("", 0);
}

export async function getAppealEmailSession(request, db, now = new Date()) {
  const store = database(db);
  const token = cookies(request).get(EMAIL_SESSION_COOKIE);
  if (!token) return null;
  const sessionHash = await sha256(token);
  const nowIso = new Date(timestamp(now)).toISOString();
  const row = await store.prepare(`
    SELECT s.account_id AS accountId, s.expires_at AS expiresAt, a.email
    FROM appeal_email_sessions s
    JOIN appeal_email_accounts a ON a.account_id = s.account_id
    WHERE s.session_hash = ? AND s.expires_at > ? AND a.verified_at IS NOT NULL
    LIMIT 1
  `).bind(sessionHash, nowIso).first();
  if (!row) return null;
  await store.prepare(`
    UPDATE appeal_email_sessions SET last_seen_at = ?
    WHERE session_hash = ? AND last_seen_at < ?
  `).bind(nowIso, sessionHash, new Date(timestamp(now) - 15 * 60 * 1000).toISOString()).run().catch(() => {});
  return Object.freeze({
    subject: `email:${row.accountId}`,
    email: Object.freeze({ address: row.email }),
    discord: null,
    linkedMinecraftAccounts: Object.freeze([]),
    expiresAt: row.expiresAt,
    sessionHash
  });
}

export async function deleteAppealEmailSession(request, db) {
  const store = database(db);
  const token = cookies(request).get(EMAIL_SESSION_COOKIE);
  if (!token) return false;
  const result = await store.prepare("DELETE FROM appeal_email_sessions WHERE session_hash = ?")
    .bind(await sha256(token)).run();
  return Number(result?.meta?.changes ?? 0) === 1;
}

export const APPEAL_EMAIL_PASSWORD_ITERATIONS = PASSWORD_ITERATIONS;
