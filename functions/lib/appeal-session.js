import { authenticateRequest } from "./auth.js";
import { getAppealEmailSession } from "./appeal-email-auth.js";
import { getCompetitionIdentitySession } from "./competitions/identity.js";
import { isCanonicalUuid } from "./validation.js";

function bytesToUuid(bytes) {
  const value = new Uint8Array(bytes.slice(0, 16));
  value[6] = (value[6] & 0x0f) | 0x50;
  value[8] = (value[8] & 0x3f) | 0x80;
  const hex = [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function validWebsiteSubject(value) {
  if (/^discord:\d{16,22}$/.test(value)) return true;
  if (!value.startsWith("email:")) return false;
  return isCanonicalUuid(value.slice("email:".length));
}

export async function websiteAppealAccountId(subject) {
  const value = String(subject ?? "").trim().toLowerCase();
  if (!validWebsiteSubject(value)) throw new TypeError("Website appeal identity is invalid");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`enthusia:website-account:v1:${value}`)
  );
  return bytesToUuid(new Uint8Array(digest));
}

export async function discordAppealAccountId(subject) {
  const value = String(subject ?? "").trim();
  if (!/^discord:\d{16,22}$/.test(value)) throw new TypeError("Discord appeal identity is invalid");
  return websiteAppealAccountId(value);
}

function linkedAppealSession(session) {
  return Object.freeze({
    subject: session.subject,
    accountId: null,
    discord: session.discord ?? null,
    email: session.email ?? null,
    linkedMinecraftAccounts: session.linkedMinecraftAccounts ?? Object.freeze([]),
    expiresAt: session.expiresAt
  });
}

async function withWebsiteAccountId(session) {
  if (!session) return null;
  return Object.freeze({
    ...linkedAppealSession(session),
    accountId: await websiteAppealAccountId(session.subject)
  });
}

function accessAppealSession(session) {
  return Object.freeze({
    subject: session.subject,
    accountId: session.player.uuid,
    discord: null,
    email: null,
    linkedMinecraftAccounts: Object.freeze([session.player])
  });
}

export async function authenticateLinkedAppealRequest(request, env) {
  const discordSession = await getCompetitionIdentitySession(request, env?.COMPETITIONS_DB);
  if (discordSession) return withWebsiteAccountId(discordSession);
  return withWebsiteAccountId(await getAppealEmailSession(request, env?.COMPETITIONS_DB));
}

export async function authenticateAppealRequest(request, env) {
  try {
    const linked = await authenticateLinkedAppealRequest(request, env);
    if (linked) return linked;
  } catch {
    // Cloudflare Access remains a compatibility path for existing staff-site sessions.
  }
  return accessAppealSession(await authenticateRequest(request, env));
}

export function linkedMinecraftAccount(session, uuid) {
  const candidate = String(uuid ?? "").trim().toLowerCase();
  if (!isCanonicalUuid(candidate)) return null;
  return session?.linkedMinecraftAccounts?.find((account) => account.uuid.toLowerCase() === candidate) ?? null;
}
