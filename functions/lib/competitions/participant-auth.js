import { competitionPlayerContext } from "./bridge.js";
import { getCompetitionIdentitySession } from "./identity.js";
import { isCanonicalUuid } from "../validation.js";

const MAX_LINKED_ACCOUNTS = 16;
const MEMBERSHIP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PLAYER_NAME = /^[A-Za-z0-9_]{1,16}$/;

function rawLinks(session) {
  if (!session || !Array.isArray(session.linkedMinecraftAccounts)) return [];
  return session.linkedMinecraftAccounts;
}

function normalizedLink(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const uuid = String(source.uuid ?? "").trim().toLowerCase();
  const name = String(source.name ?? "").trim();
  if (!isCanonicalUuid(uuid) || !PLAYER_NAME.test(name)) return null;
  return { uuid, name };
}

function addNormalizedLink(links, raw) {
  const account = normalizedLink(raw);
  if (account) links.set(account.uuid, account);
  return links.size >= MAX_LINKED_ACCOUNTS;
}

function normalizedLinks(session) {
  const links = new Map();
  for (const raw of rawLinks(session)) {
    if (addNormalizedLink(links, raw)) break;
  }
  return links;
}

function requestedLinkUuid(value) {
  if ([null, undefined, ""].includes(value)) return undefined;
  const uuid = String(value).trim().toLowerCase();
  return isCanonicalUuid(uuid) ? uuid : null;
}

export async function getCompetitionParticipantSession(request, db) {
  const session = await getCompetitionIdentitySession(request, db);
  if (!session) return null;
  const links = normalizedLinks(session);
  return Object.freeze({
    ...session,
    linkedMinecraftAccounts: Object.freeze([...links.values()].map((account) => Object.freeze(account)))
  });
}

export function discordMembershipError(session, now = Date.now()) {
  if (session?.discordGuildMember !== true) return "discord_membership_required";
  const checkedAt = Date.parse(session.discordRolesCheckedAt ?? "");
  if (!Number.isFinite(checkedAt) || now - checkedAt > MEMBERSHIP_MAX_AGE_MS) {
    return "discord_reauthentication_required";
  }
  return null;
}

export function linkedMinecraftAccount(session, requestedUuid = null) {
  const links = normalizedLinks(session);
  if (!links.size) return null;
  const uuid = requestedLinkUuid(requestedUuid);
  if (uuid === undefined) return links.values().next().value ?? null;
  return uuid === null ? null : links.get(uuid) ?? null;
}

export function linkedMinecraftUuids(session) {
  return [...normalizedLinks(session).keys()];
}

export async function bridgeContextForLinkedAccount(env, session, account) {
  if (!account || !isCanonicalUuid(account.uuid)) throw new TypeError("Linked Minecraft account is required");
  return competitionPlayerContext(env, {
    subject: session.subject,
    player: { uuid: account.uuid, name: account.name }
  });
}

export async function bridgeContextsForAllLinkedAccounts(env, session) {
  const accounts = [...normalizedLinks(session).values()];
  const contexts = await Promise.all(accounts.map(async (account) => ({
    account,
    context: await bridgeContextForLinkedAccount(env, session, account)
  })));
  return contexts;
}

export function maxLinkedActiveMinutes(contexts) {
  let maximum = 0;
  for (const item of contexts ?? []) {
    maximum = Math.max(maximum, Math.max(0, Math.floor(Number(item?.context?.activeMinutes) || 0)));
  }
  return maximum;
}

export { MAX_LINKED_ACCOUNTS, MEMBERSHIP_MAX_AGE_MS, normalizedLink, normalizedLinks };
