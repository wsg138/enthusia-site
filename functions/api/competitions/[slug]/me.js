import { competitionsEnabled, hasCompetitionDatabase } from "../../../lib/competitions/access.js";
import {
  bridgeContextForLinkedAccount,
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

function safeLinkedAccounts(playerContext, session) {
  const accounts = new Map();
  for (const raw of session?.linkedMinecraftAccounts ?? []) {
    const uuid = String(raw?.uuid ?? "").trim().toLowerCase();
    const name = String(raw?.name ?? "").trim();
    if (isCanonicalUuid(uuid) && /^[A-Za-z0-9_]{1,16}$/.test(name)) accounts.set(uuid, name);
  }
  // Legacy-compatible fallback for the private Access-based development tests.
  for (const raw of playerContext?.linkedMinecraftAccounts ?? []) {
    const uuid = String(typeof raw === "string" ? raw : raw?.uuid ?? "").trim().toLowerCase();
    const name = String(typeof raw === "object" ? raw?.name ?? "" : "").trim();
    if (isCanonicalUuid(uuid) && /^[A-Za-z0-9_]{1,16}$/.test(name)) accounts.set(uuid, name);
  }
  if (session?.player && isCanonicalUuid(session.player.uuid) && /^[A-Za-z0-9_]{1,16}$/.test(session.player.name)) {
    accounts.set(session.player.uuid, session.player.name);
  }
  return [...accounts].map(([uuid, name]) => ({ uuid, name }));
}

function safeGuilds(playerContext, permission) {
  const guilds = [];
  for (const raw of playerContext?.guilds ?? []) {
    const id = String(raw?.guildId ?? raw?.id ?? "").trim();
    const name = String(raw?.guildName ?? raw?.name ?? "").trim();
    if (!id || id.length > 128 || !name || name.length > 80) continue;
    const permissions = Array.isArray(raw?.permissions) ? raw.permissions.map(String) : [];
    guilds.push({ id, name, canSubmit: permissions.includes(permission) });
  }
  return guilds.sort((left, right) => left.name.localeCompare(right.name));
}

export async function onRequestGet(context) {
  if (!competitionsEnabled(context.env)) return json({ error: "not_found" }, 404);
  const read = await authorizeCompetitionRead(context);
  if (read.response) return read.response;
  if (!hasCompetitionDatabase(context.env)) return json({ error: "competition_database_unavailable" }, 503);

  let session;
  try {
    session = await getCompetitionParticipantSession(context.request, context.env.COMPETITIONS_DB);
  } catch {
    return json({ error: "competition_identity_unavailable" }, 503);
  }
  if (!session) return unauthorized();
  if (!session.linkedMinecraftAccounts.length) {
    return json({ error: "minecraft_link_required", linkedMinecraftAccounts: [] }, 403);
  }

  const requestedUuid = requestedPlayerUuid(context.request);
  if (requestedUuid === "INVALID") return json({ error: "invalid_minecraft_account" }, 400);
  const selectedPlayer = linkedMinecraftAccount(session, requestedUuid);
  if (!selectedPlayer) return json({ error: "minecraft_account_not_linked" }, 403);

  const slug = slugValue(context);
  if (!slug || slug === "admin") return json({ error: "competition_not_found" }, 404);

  try {
    const competition = await getPublicCompetitionBySlug(context.env.COMPETITIONS_DB, slug);
    if (!competition) return json({ error: "competition_not_found" }, 404);

    const playerContext = await bridgeContextForLinkedAccount(context.env, session, selectedPlayer);
    const permission = competition.config?.entries?.guildSubmissionPermission ?? "competition.submit";
    return json({
      accountSubject: session.subject,
      discord: session.discord,
      selectedPlayer,
      linkedMinecraftAccounts: safeLinkedAccounts(null, session),
      guilds: safeGuilds(playerContext, permission),
      activeMinutes: Math.max(0, Math.floor(Number(playerContext.activeMinutes) || 0)),
      votingRequiredActiveMinutes: Math.max(0, Math.floor(Number(competition.config?.voting?.minimumActiveMinutes) || 0)),
      lifecycleState: competition.lifecycleState
    });
  } catch (error) {
    const message = String(error?.message ?? error);
    if (message.includes("Competition bridge")) return json({ error: "competition_bridge_unavailable" }, 503);
    return json({ error: "participant_context_unavailable" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}

export { requestedPlayerUuid, safeGuilds, safeLinkedAccounts, slugValue };
