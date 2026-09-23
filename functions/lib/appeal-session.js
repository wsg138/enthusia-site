import { authenticateRequest } from "./auth.js";
import { getCompetitionIdentitySession } from "./competitions/identity.js";
import { isCanonicalUuid } from "./validation.js";

function bytesToUuid(bytes) {
  const value = new Uint8Array(bytes.slice(0, 16));
  value[6] = (value[6] & 0x0f) | 0x50;
  value[8] = (value[8] & 0x3f) | 0x80;
  const hex = [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function discordAppealAccountId(subject) {
  const value = String(subject ?? "").trim();
  if (!/^discord:\d{16,22}$/.test(value)) throw new TypeError("Discord appeal identity is invalid");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`enthusia:website-account:v1:${value}`)
  );
  return bytesToUuid(new Uint8Array(digest));
}

function accessAppealSession(session) {
  return Object.freeze({
    subject: session.subject,
    accountId: session.player.uuid,
    discord: null,
    linkedMinecraftAccounts: Object.freeze([session.player])
  });
}

export async function authenticateAppealRequest(request, env) {
  try {
    const session = await getCompetitionIdentitySession(request, env?.COMPETITIONS_DB);
    if (session) {
      return Object.freeze({
        subject: session.subject,
        accountId: await discordAppealAccountId(session.subject),
        discord: session.discord,
        linkedMinecraftAccounts: session.linkedMinecraftAccounts
      });
    }
  } catch {
    // Cloudflare Access remains a compatibility path for existing staff-site sessions.
  }
  return accessAppealSession(await authenticateRequest(request, env));
}

export async function authenticateLinkedAppealRequest(request, env) {
  const session = await getCompetitionIdentitySession(request, env?.COMPETITIONS_DB);
  if (!session) return null;
  return Object.freeze({
    subject: session.subject,
    discord: session.discord,
    linkedMinecraftAccounts: session.linkedMinecraftAccounts,
    expiresAt: session.expiresAt
  });
}

export function linkedMinecraftAccount(session, uuid) {
  const candidate = String(uuid ?? "").trim().toLowerCase();
  if (!isCanonicalUuid(candidate)) return null;
  return session?.linkedMinecraftAccounts?.find((account) => account.uuid.toLowerCase() === candidate) ?? null;
}
