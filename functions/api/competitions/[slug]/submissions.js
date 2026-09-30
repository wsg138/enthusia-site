import { competitionsEnabled, hasCompetitionDatabase } from "../../../lib/competitions/access.js";
import {
  bridgeContextForLinkedAccount,
  discordMembershipError,
  getCompetitionParticipantSession,
  linkedMinecraftAccount,
  linkedMinecraftUuids
} from "../../../lib/competitions/participant-auth.js";
import { listEntrantModerationNotices } from "../../../lib/competitions/entrant-moderation.js";
import { authorizeCompetitionRead } from "../../../lib/competitions/public-access.js";
import { getPublicCompetitionBySlug } from "../../../lib/competitions/repository.js";
import { createSubmissionDraft } from "../../../lib/competitions/submission-creation.js";
import {
  countGuildEntries,
  countLinkedPlayerEntrySlots,
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

function accountList(value) {
  return Array.isArray(value) ? value : [];
}

function addLinkedAccount(accounts, uuidValue, nameValue) {
  const uuid = String(uuidValue ?? "").trim().toLowerCase();
  const name = String(nameValue ?? "").trim();
  if (isCanonicalUuid(uuid) && /^[A-Za-z0-9_]{1,16}$/.test(name)) {
    accounts.set(uuid, name);
  }
}

function addBridgeAccount(accounts, raw) {
  const uuid = typeof raw === "string" ? raw : raw?.uuid;
  const name = typeof raw === "object" ? raw?.name : "";
  addLinkedAccount(accounts, uuid, name);
}

function addSessionAccount(accounts, raw) {
  addLinkedAccount(accounts, raw?.uuid, raw?.name);
}

function linkedAccounts(value) {
  return value ? accountList(value.linkedMinecraftAccounts) : [];
}

function normalizeLinkedAccounts(playerContext, session) {
  const accounts = new Map();
  for (const raw of linkedAccounts(session)) {
    addSessionAccount(accounts, raw);
  }
  // Preserve compatibility with earlier unit contracts; production ownership
  // comes from the Discord identity link table above, not bridge-returned links.
  for (const raw of linkedAccounts(playerContext)) {
    addBridgeAccount(accounts, raw);
  }
  addSessionAccount(accounts, session?.player);
  return accounts;
}

function findGuild(playerContext, guildId, permission) {
  return (playerContext?.guilds ?? []).find((guild) => {
    const id = String(guild?.guildId ?? guild?.id ?? "").trim();
    const permissions = Array.isArray(guild?.permissions) ? guild.permissions.map(String) : [];
    return id === guildId && permissions.includes(permission);
  }) ?? null;
}

function isLocationObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasValidLocationValues(source, worldName) {
  return Boolean(worldName)
    && worldName.length <= 128
    && Number.isInteger(source.x)
    && Number.isInteger(source.y)
    && Number.isInteger(source.z)
    && source.exactCoordinatesConfirmed === true;
}

function requestedLocation(input, requested) {
  if (!requested) return null;
  const source = input?.location;
  if (!isLocationObject(source)) return undefined;
  const worldName = typeof source.worldName === "string" ? source.worldName.trim() : "";
  if (!hasValidLocationValues(source, worldName)) return undefined;
  return {
    worldName,
    x: source.x,
    y: source.y,
    z: source.z,
    exactCoordinatesConfirmed: true
  };
}

async function participantSession(context) {
  try {
    const session = await getCompetitionParticipantSession(context.request, context.env.COMPETITIONS_DB);
    return { session };
  } catch {
    return { response: json({ error: "competition_identity_unavailable" }, 503) };
  }
}

function identityResponse(session) {
  if (!session) return unauthorized();
  const membershipError = discordMembershipError(session);
  if (membershipError) return json({ error: membershipError }, 403);
  return session.linkedMinecraftAccounts.length
    ? null
    : json({ error: "minecraft_link_required" }, 403);
}

async function competitionContext(context, slug, session) {
  try {
    const competition = await getPublicCompetitionBySlug(context.env.COMPETITIONS_DB, slug);
    return competition
      ? { session, competition }
      : { response: json({ error: "competition_not_found" }, 404) };
  } catch {
    return { response: json({ error: "competition_unavailable" }, 503) };
  }
}

async function resolveEntrantContext(context) {
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
  const read = await authorizeCompetitionRead(context);
  if (read.response) return { response: read.response };
  if (!hasCompetitionDatabase(context.env)) {
    return { response: json({ error: "competition_database_unavailable" }, 503) };
  }
  const identity = await participantSession(context);
  if (identity.response) return identity;
  const identityError = identityResponse(identity.session);
  if (identityError) return { response: identityError };
  const slug = slugValue(context);
  if (!slug || slug === "admin") return { response: json({ error: "competition_not_found" }, 404) };
  return competitionContext(context, slug, identity.session);
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

async function readInput(request) {
  let input;
  try {
    input = await request.json();
  } catch {
    input = null;
  }
  return input;
}

function submissionInput(input, competition) {
  const source = input || {};
  const entries = competition.config.entries;
  const entryType = source.entryType;
  if (!entries.allowedTypes.includes(entryType)) {
    return { response: json({ error: "entry_type_not_allowed" }, 400) };
  }
  const title = cleanTitle(source.title);
  const description = cleanDescription(source.description, entries.maxDescriptionChars);
  const location = requestedLocation(source, Boolean(entries.coordinatesRequested));
  if (!title || !description || location === undefined) {
    return { response: json({ error: "invalid_submission_details" }, 400) };
  }
  return { source, entryType, title, description, location };
}

async function playerContext(context, session, owner) {
  try {
    const value = await bridgeContextForLinkedAccount(context.env, session, owner);
    return { value };
  } catch {
    return { response: json({ error: "competition_bridge_unavailable" }, 503) };
  }
}

function cleanGuildId(value) {
  const guildId = String(value ?? "").trim();
  return guildId && guildId.length <= 128 ? guildId : null;
}

function cleanGuildName(guild) {
  const guildName = String(guild?.guildName ?? guild?.name ?? "").trim();
  return guildName && guildName.length <= 80 ? guildName : null;
}

function guildSelection(input, context, competition) {
  const guildId = cleanGuildId(input.guildId);
  if (!guildId) {
    return { response: json({ error: "guild_required" }, 400) };
  }
  const permission = competition.config.entries.guildSubmissionPermission;
  const guild = findGuild(context, guildId, permission);
  if (!guild) return { response: json({ error: "guild_submission_permission_required" }, 403) };
  const guildName = cleanGuildName(guild);
  if (!guildName) {
    return { response: json({ error: "guild_context_invalid" }, 503) };
  }
  return { guildId, guildName };
}

async function guildEntry(context, competition, input, entrantContext) {
  const selection = guildSelection(input, entrantContext, competition);
  if (selection.response) return selection;
  const count = await countGuildEntries(
    context.env.COMPETITIONS_DB,
    competition.id,
    selection.guildId
  );
  return count >= competition.config.entries.maxEntriesPerGuild
    ? { response: json({ error: "guild_entry_limit_reached" }, 409) }
    : selection;
}

async function playerEntry(context, competition, session) {
  const count = await countLinkedPlayerEntrySlots(
    context.env.COMPETITIONS_DB,
    competition.id,
    linkedMinecraftUuids(session)
  );
  return count >= competition.config.entries.maxEntriesPerPlayer
    ? { response: json({ error: "player_entry_limit_reached" }, 409) }
    : { guildId: null, guildName: null };
}

async function entryOwnership(context, competition, fields, entrantContext, session) {
  return fields.entryType === "GUILD"
    ? guildEntry(context, competition, fields.source, entrantContext)
    : playerEntry(context, competition, session);
}

function creationFailure(error) {
  const message = String(error?.message ?? error);
  if (["competition_judge_cannot_enter", "competition_linked_judge_cannot_enter"]
    .some((value) => message.includes(value))) {
    return json({ error: "judges_cannot_submit_entries" }, 409);
  }
  return message.includes("competition_linked_entry_limit_reached")
    ? json({ error: "player_entry_limit_reached" }, 409)
    : json({ error: "submission_create_failed" }, 503);
}

function createdSubmissionResponse(draft) {
  return json({
    submission: {
      id: draft.id,
      competitionId: draft.competitionId,
      entryType: draft.entryType,
      status: "DRAFT",
      ownerUuid: draft.ownerUuid,
      ownerName: draft.ownerName,
      guildId: draft.guildId,
      guildName: draft.guildName,
      title: draft.title,
      description: draft.description,
      revision: 1,
      createdAt: draft.createdAt
    }
  }, 201);
}

async function persistDraft(context, draft) {
  try {
    const result = await createSubmissionDraft(context.env.COMPETITIONS_DB, draft);
    return result.status === "CREATED"
      ? createdSubmissionResponse(draft)
      : json({ error: "submission_create_conflict" }, 409);
  } catch (error) {
    return creationFailure(error);
  }
}

function draftRecord(competition, session, fields, owner, ownership) {
  return {
    id: crypto.randomUUID(),
    competitionId: competition.id,
    expectedConfigVersion: competition.configVersion,
    entryType: fields.entryType,
    ownerSubject: session.subject,
    ownerUuid: owner.uuid,
    ownerName: owner.name,
    guildId: ownership.guildId,
    guildName: ownership.guildName,
    title: fields.title,
    description: fields.description,
    location: fields.location,
    createdAt: new Date().toISOString(),
    auditEventId: crypto.randomUUID()
  };
}

async function createEntrantSubmission(context, resolved, input) {
  const { session, competition } = resolved;
  if (competition.lifecycleState !== "SUBMISSIONS_OPEN") {
    return json({ error: "submissions_not_open" }, 409);
  }
  const fields = submissionInput(input, competition);
  if (fields.response) return fields.response;
  const owner = linkedMinecraftAccount(session, fields.source.ownerUuid ?? null);
  if (!owner) return json({ error: "minecraft_account_not_linked" }, 403);
  const entrantContext = await playerContext(context, session, owner);
  if (entrantContext.response) return entrantContext.response;
  const ownership = await entryOwnership(context, competition, fields, entrantContext.value, session);
  if (ownership.response) return ownership.response;
  return persistDraft(context, draftRecord(competition, session, fields, owner, ownership));
}

async function entrantSubmissionResponse(context, resolved, input) {
  try {
    return await createEntrantSubmission(context, resolved, input);
  } catch (error) {
    return creationFailure(error);
  }
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const resolved = await resolveEntrantContext(context);
  if (resolved.response) return resolved.response;
  const input = await readInput(context.request);
  return entrantSubmissionResponse(context, resolved, input);
}

export function onRequest() {
  return methodNotAllowed(["GET", "POST"]);
}

export { cleanDescription, cleanTitle, findGuild, normalizeLinkedAccounts, requestedLocation, slugValue };
