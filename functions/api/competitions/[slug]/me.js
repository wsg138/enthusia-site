import { competitionsEnabled, hasCompetitionDatabase } from "../../../lib/competitions/access.js";
import {
  bridgeContextsForAllLinkedAccounts,
  discordMembershipError,
  getCompetitionParticipantSession,
  linkedMinecraftAccount
} from "../../../lib/competitions/participant-auth.js";
import { authorizeCompetitionRead } from "../../../lib/competitions/public-access.js";
import { getPublicCompetitionBySlug } from "../../../lib/competitions/repository.js";
import { json, methodNotAllowed, unauthorized } from "../../../lib/responses.js";
import { isCanonicalUuid } from "../../../lib/validation.js";

function slugValue(context) {
  const value = typeof context?.params?.slug === "string" ? context.params.slug.trim().toLowerCase() : "";
  return /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(value) ? value : null;
}

function requestedPlayerUuid(request) {
  try {
    const value = new URL(request.url).searchParams.get("playerUuid");
    if (value === null || value === "") return null;
    const uuid = value.trim().toLowerCase();
    return isCanonicalUuid(uuid) ? uuid : "INVALID";
  } catch {
    return "INVALID";
  }
}

function listValue(value) {
  return Array.isArray(value) ? value : [];
}

function addAccount(accounts, uuidValue, nameValue) {
  const uuid = String(uuidValue ?? "").trim().toLowerCase();
  const name = String(nameValue ?? "").trim();
  if (isCanonicalUuid(uuid) && /^[A-Za-z0-9_]{1,16}$/.test(name)) {
    accounts.set(uuid, name);
  }
}

function addBridgeAccount(accounts, raw) {
  const uuid = typeof raw === "string" ? raw : raw?.uuid;
  const name = typeof raw === "object" ? raw?.name : "";
  addAccount(accounts, uuid, name);
}

function addSessionAccount(accounts, raw) {
  addAccount(accounts, raw?.uuid, raw?.name);
}

function linkedAccounts(value) {
  return value ? listValue(value.linkedMinecraftAccounts) : [];
}

function safeLinkedAccounts(playerContext, session) {
  const accounts = new Map();
  for (const raw of linkedAccounts(session)) {
    addSessionAccount(accounts, raw);
  }
  for (const raw of linkedAccounts(playerContext)) {
    addBridgeAccount(accounts, raw);
  }
  addSessionAccount(accounts, session?.player);
  return [...accounts].map(([uuid, name]) => ({ uuid, name }));
}

function firstText(primary, fallback) {
  return String(primary ?? fallback ?? "").trim();
}

function validGuildIdentity(id, name) {
  return Boolean(id) && id.length <= 128 && Boolean(name) && name.length <= 80;
}

function safeGuild(raw) {
  const id = firstText(raw?.guildId, raw?.id);
  const name = firstText(raw?.guildName, raw?.name);
  if (!validGuildIdentity(id, name)) return null;
  const permissions = Array.isArray(raw?.permissions) ? raw.permissions.map(String) : [];
  return { id, name, permissions };
}

function mergeGuild(guilds, guild, permission) {
  const current = guilds.get(guild.id);
  guilds.set(guild.id, {
    id: guild.id,
    name: guild.name,
    canSubmit: Boolean(current?.canSubmit) || guild.permissions.includes(permission)
  });
}

function safeGuilds(playerContext, permission) {
  const guilds = new Map();
  for (const raw of listValue(playerContext?.guilds)) {
    const guild = safeGuild(raw);
    if (guild) mergeGuild(guilds, guild, permission);
  }
  return [...guilds.values()].sort((left, right) => left.name.localeCompare(right.name));
}

async function readScope(context) {
  if (!competitionsEnabled(context.env)) return json({ error: "not_found" }, 404);
  const read = await authorizeCompetitionRead(context);
  if (read.response) return read.response;
  if (!hasCompetitionDatabase(context.env)) return json({ error: "competition_database_unavailable" }, 503);
  return null;
}

async function participantSession(context) {
  try {
    const session = await getCompetitionParticipantSession(context.request, context.env.COMPETITIONS_DB);
    return { session };
  } catch {
    return { response: json({ error: "competition_identity_unavailable" }, 503) };
  }
}

function sessionAccessResponse(session) {
  if (!session) return unauthorized();
  const membershipError = discordMembershipError(session);
  if (membershipError) return json({ error: membershipError }, 403);
  return session.linkedMinecraftAccounts.length
    ? null
    : json({ error: "minecraft_link_required", linkedMinecraftAccounts: [] }, 403);
}

async function selectedIdentity(context) {
  const participant = await participantSession(context);
  if (participant.response) return participant;
  const accessResponse = sessionAccessResponse(participant.session);
  if (accessResponse) return { response: accessResponse };
  const requestedUuid = requestedPlayerUuid(context.request);
  if (requestedUuid === "INVALID") {
    return { response: json({ error: "invalid_minecraft_account" }, 400) };
  }
  const selectedPlayer = linkedMinecraftAccount(participant.session, requestedUuid);
  return selectedPlayer
    ? { session: participant.session, selectedPlayer }
    : { response: json({ error: "minecraft_account_not_linked" }, 403) };
}

function bridgeFailure(error) {
  const message = String(error?.message ?? error);
  return message.includes("Competition bridge")
    ? json({ error: "competition_bridge_unavailable" }, 503)
    : json({ error: "participant_context_unavailable" }, 503);
}

async function participantData(context, identity, slug) {
  try {
    const competition = await getPublicCompetitionBySlug(context.env.COMPETITIONS_DB, slug);
    if (!competition) return { response: json({ error: "competition_not_found" }, 404) };

    const contexts = await bridgeContextsForAllLinkedAccounts(context.env, identity.session);
    const selected = contexts.find((item) => item.account.uuid === identity.selectedPlayer.uuid);
    if (!selected?.context) {
      return { response: json({ error: "minecraft_account_context_unavailable" }, 503) };
    }
    return { competition, contexts, selectedContext: selected.context };
  } catch (error) {
    return { response: bridgeFailure(error) };
  }
}

function activeMinutes(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function guildContext(contexts) {
  return {
    guilds: contexts.flatMap((item) => listValue(item.context?.guilds))
  };
}

function participantResponse(identity, data) {
  const permission = data.competition.config?.entries?.guildSubmissionPermission ?? "competition.submit";
  return json({
    accountSubject: identity.session.subject,
    discord: identity.session.discord,
    selectedPlayer: identity.selectedPlayer,
    linkedMinecraftAccounts: safeLinkedAccounts(null, identity.session),
    guilds: safeGuilds(guildContext(data.contexts), permission),
    activeMinutes: activeMinutes(data.selectedContext.activeMinutes),
    votingRequiredActiveMinutes: activeMinutes(data.competition.config?.voting?.minimumActiveMinutes),
    lifecycleState: data.competition.lifecycleState
  });
}

export async function onRequestGet(context) {
  const scopeResponse = await readScope(context);
  if (scopeResponse) return scopeResponse;
  const identity = await selectedIdentity(context);
  if (identity.response) return identity.response;
  const slug = slugValue(context);
  if (!slug || slug === "admin") return json({ error: "competition_not_found" }, 404);
  const data = await participantData(context, identity, slug);
  return data.response ? data.response : participantResponse(identity, data);
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}

export { requestedPlayerUuid, safeGuilds, safeLinkedAccounts, slugValue };
