import { authenticateRequest } from "../../../lib/auth.js";
import { competitionsEnabled, hasCompetitionDatabase } from "../../../lib/competitions/access.js";
import { competitionPlayerContext } from "../../../lib/competitions/bridge.js";
import { authorizeCompetitionRead } from "../../../lib/competitions/public-access.js";
import { getPublicCompetitionBySlug } from "../../../lib/competitions/repository.js";
import { json, methodNotAllowed, unauthorized } from "../../../lib/responses.js";
import { isCanonicalUuid } from "../../../lib/validation.js";

function slugValue(context) {
  const value = typeof context?.params?.slug === "string" ? context.params.slug.trim().toLowerCase() : "";
  return /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(value) ? value : null;
}

function safeLinkedAccounts(playerContext, session) {
  const accounts = new Map();
  for (const raw of playerContext?.linkedMinecraftAccounts ?? []) {
    if (typeof raw === "string") {
      const uuid = raw.trim().toLowerCase();
      if (isCanonicalUuid(uuid) && uuid === session.player.uuid) {
        accounts.set(uuid, session.player.name);
      }
      continue;
    }
    const uuid = String(raw?.uuid ?? "").trim().toLowerCase();
    const name = String(raw?.name ?? "").trim();
    if (isCanonicalUuid(uuid) && /^[A-Za-z0-9_]{1,16}$/.test(name)) accounts.set(uuid, name);
  }
  if (!accounts.has(session.player.uuid)) accounts.set(session.player.uuid, session.player.name);
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
    session = await authenticateRequest(context.request, context.env);
  } catch {
    return unauthorized();
  }

  const slug = slugValue(context);
  if (!slug || slug === "admin") return json({ error: "competition_not_found" }, 404);

  try {
    const competition = await getPublicCompetitionBySlug(context.env.COMPETITIONS_DB, slug);
    if (!competition) return json({ error: "competition_not_found" }, 404);

    const playerContext = await competitionPlayerContext(context.env, session);
    const permission = competition.config?.entries?.guildSubmissionPermission ?? "competition.submit";
    return json({
      accountSubject: session.subject,
      selectedPlayer: { uuid: session.player.uuid, name: session.player.name },
      linkedMinecraftAccounts: safeLinkedAccounts(playerContext, session),
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

export { safeGuilds, safeLinkedAccounts, slugValue };
