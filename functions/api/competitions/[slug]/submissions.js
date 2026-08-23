import { competitionsEnabled, hasCompetitionDatabase } from "../../../lib/competitions/access.js";
import {
  bridgeContextForLinkedAccount,
  getCompetitionParticipantSession,
  linkedMinecraftAccount
} from "../../../lib/competitions/participant-auth.js";
import { listEntrantModerationNotices } from "../../../lib/competitions/entrant-moderation.js";
import { authorizeCompetitionRead } from "../../../lib/competitions/public-access.js";
import { getPublicCompetitionBySlug } from "../../../lib/competitions/repository.js";
import {
  countGuildEntries,
  countPlayerEntrySlots,
  createSubmissionDraft,
  listAccountSubmissions
} from "../../../lib/competitions/submissions.js";
import { json, methodNotAllowed, unauthorized } from "../../../lib/responses.js";
import { requireSameOrigin } from "../../../lib/security.js";
import { isCanonicalUuid } from "../../../lib/validation.js";

function slugValue(context) {
  const value = typeof context?.params?.slug === "string" ? context.params.slug.trim().toLowerCase() : "";
  return /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(value) ? value : null;
}

function cleanTitle(value) {
  if (typeof value !== "string") return null;
  const title = value.trim().replace(/\s+/g, " ");
  return title.length >= 1 && title.length <= 100 ? title : null;
}

function cleanDescription(value, max) {
  if (typeof value !== "string") return null;
  const description = value.replace(/\r\n?/g, "\n").trim();
  return description.length >= 1 && description.length <= max ? description : null;
}

function normalizeLinkedAccounts(playerContext, session) {
  const accounts = new Map();
  for (const raw of session?.linkedMinecraftAccounts ?? []) {
    const uuid = String(raw?.uuid ?? "").trim().toLowerCase();
    const name = String(raw?.name ?? "").trim();
    if (isCanonicalUuid(uuid) && /^[A-Za-z0-9_]{1,16}$/.test(name)) accounts.set(uuid, name);
  }
  // Preserve compatibility with earlier unit contracts; production ownership
  // comes from the Discord identity link table above, not bridge-returned links.
  for (const raw of playerContext?.linkedMinecraftAccounts ?? []) {
    const uuid = String(typeof raw === "string" ? raw : raw?.uuid ?? "").trim().toLowerCase();
    const name = String(typeof raw === "object" ? raw?.name ?? "" : "").trim();
    if (isCanonicalUuid(uuid) && /^[A-Za-z0-9_]{1,16}$/.test(name)) accounts.set(uuid, name);
  }
  if (session?.player && isCanonicalUuid(session.player.uuid) && /^[A-Za-z0-9_]{1,16}$/.test(session.player.name)) {
    accounts.set(session.player.uuid, session.player.name);
  }
  return accounts;
}

function findGuild(playerContext, guildId, permission) {
  return (playerContext?.guilds ?? []).find((guild) => {
    const id = String(guild?.guildId ?? guild?.id ?? "").trim();
    const permissions = Array.isArray(guild?.permissions) ? guild.permissions.map(String) : [];
    return id === guildId && permissions.includes(permission);
  }) ?? null;
}

function requestedLocation(input, requested) {
  if (!requested) return null;
  const source = input?.location;
  if (!source || typeof source !== "object" || Array.isArray(source)) return undefined;
  const worldName = typeof source.worldName === "string" ? source.worldName.trim() : "";
  const x = source.x;
  const y = source.y;
  const z = source.z;
  if (
    !worldName
    || worldName.length > 128
    || !Number.isInteger(x)
    || !Number.isInteger(y)
    || !Number.isInteger(z)
    || source.exactCoordinatesConfirmed !== true
  ) return undefined;
  return { worldName, x, y, z, exactCoordinatesConfirmed: true };
}

async function resolveEntrantContext(context) {
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
  const read = await authorizeCompetitionRead(context);
  if (read.response) return { response: read.response };
  if (!hasCompetitionDatabase(context.env)) {
    return { response: json({ error: "competition_database_unavailable" }, 503) };
  }
  let session;
  try {
    session = await getCompetitionParticipantSession(context.request, context.env.COMPETITIONS_DB);
  } catch {
    return { response: json({ error: "competition_identity_unavailable" }, 503) };
  }
  if (!session) return { response: unauthorized() };
  if (!session.linkedMinecraftAccounts.length) return { response: json({ error: "minecraft_link_required" }, 403) };

  const slug = slugValue(context);
  if (!slug || slug === "admin") return { response: json({ error: "competition_not_found" }, 404) };
  try {
    const competition = await getPublicCompetitionBySlug(context.env.COMPETITIONS_DB, slug);
    if (!competition) return { response: json({ error: "competition_not_found" }, 404) };
    return { session, competition };
  } catch {
    return { response: json({ error: "competition_unavailable" }, 503) };
  }
}

export async function onRequestGet(context) {
  const resolved = await resolveEntrantContext(context);
  if (resolved.response) return resolved.response;
  try {
    const [submissions, notices] = await Promise.all([
      listAccountSubmissions(
        context.env.COMPETITIONS_DB,
        resolved.competition.id,
        resolved.session.subject
      ),
      listEntrantModerationNotices(
        context.env.COMPETITIONS_DB,
        resolved.competition.id,
        resolved.session.subject
      )
    ]);
    return json({
      competitionId: resolved.competition.id,
      submissions: submissions.map((submission) => ({
        ...submission,
        moderation: notices.get(submission.id) ?? null
      }))
    });
  } catch {
    return json({ error: "submissions_unavailable" }, 503);
  }
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const resolved = await resolveEntrantContext(context);
  if (resolved.response) return resolved.response;
  const { session, competition } = resolved;
  if (competition.lifecycleState !== "SUBMISSIONS_OPEN") {
    return json({ error: "submissions_not_open" }, 409);
  }

  let input;
  try {
    input = await context.request.json();
  } catch {
    input = null;
  }
  const entryType = input?.entryType;
  if (!competition.config?.entries?.allowedTypes?.includes(entryType)) {
    return json({ error: "entry_type_not_allowed" }, 400);
  }
  const title = cleanTitle(input?.title);
  const description = cleanDescription(input?.description, competition.config.entries.maxDescriptionChars);
  const location = requestedLocation(input, Boolean(competition.config.entries.coordinatesRequested));
  if (!title || !description || location === undefined) {
    return json({ error: "invalid_submission_details" }, 400);
  }

  const owner = linkedMinecraftAccount(session, input?.ownerUuid ?? null);
  if (!owner) return json({ error: "minecraft_account_not_linked" }, 403);

  let playerContext;
  try {
    playerContext = await bridgeContextForLinkedAccount(context.env, session, owner);
  } catch {
    return json({ error: "competition_bridge_unavailable" }, 503);
  }

  let guildId = null;
  let guildName = null;
  try {
    if (entryType === "GUILD") {
      guildId = String(input?.guildId ?? "").trim();
      if (!guildId || guildId.length > 128) return json({ error: "guild_required" }, 400);
      const guild = findGuild(playerContext, guildId, competition.config.entries.guildSubmissionPermission);
      if (!guild) return json({ error: "guild_submission_permission_required" }, 403);
      guildName = String(guild.guildName ?? guild.name ?? "").trim();
      if (!guildName || guildName.length > 80) return json({ error: "guild_context_invalid" }, 503);
      const count = await countGuildEntries(context.env.COMPETITIONS_DB, competition.id, guildId);
      if (count >= competition.config.entries.maxEntriesPerGuild) {
        return json({ error: "guild_entry_limit_reached" }, 409);
      }
    } else {
      const count = await countPlayerEntrySlots(context.env.COMPETITIONS_DB, competition.id, owner.uuid);
      if (count >= competition.config.entries.maxEntriesPerPlayer) {
        return json({ error: "player_entry_limit_reached" }, 409);
      }
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await createSubmissionDraft(context.env.COMPETITIONS_DB, {
      id,
      competitionId: competition.id,
      entryType,
      ownerSubject: session.subject,
      ownerUuid: owner.uuid,
      ownerName: owner.name,
      guildId,
      guildName,
      title,
      description,
      location,
      createdAt,
      auditEventId: crypto.randomUUID()
    });
    return json({
      submission: {
        id,
        competitionId: competition.id,
        entryType,
        status: "DRAFT",
        ownerUuid: owner.uuid,
        ownerName: owner.name,
        guildId,
        guildName,
        title,
        description,
        revision: 1,
        createdAt
      }
    }, 201);
  } catch (error) {
    const message = String(error?.message ?? error);
    if (message.includes("competition_judge_cannot_enter")) {
      return json({ error: "judges_cannot_submit_entries" }, 409);
    }
    return json({ error: "submission_create_failed" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET", "POST"]);
}

export { cleanDescription, cleanTitle, findGuild, normalizeLinkedAccounts, requestedLocation, slugValue };
