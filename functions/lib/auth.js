import { isCanonicalUuid } from "./validation.js";
import { getCompetitionIdentitySession } from "./competitions/identity.js";

const encoder = new TextEncoder();
const DISCORD_ROLE_MAX_AGE_MS = 60 * 60 * 1000;
const DISCORD_STAFF_ROLE_BINDINGS = Object.freeze([
  Object.freeze(["founder", "DISCORD_FOUNDER_ROLE_IDS"]),
  Object.freeze(["admin", "DISCORD_ADMIN_ROLE_IDS"]),
  Object.freeze(["developer", "DISCORD_DEVELOPER_ROLE_IDS"]),
  Object.freeze(["moderator", "DISCORD_MODERATOR_ROLE_IDS"]),
  Object.freeze(["helper", "DISCORD_HELPER_ROLE_IDS"])
]);

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  if (typeof atob !== "function") throw new Error("Base64 decoding is unavailable");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function decodeJsonSegment(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

function normalizeTeamDomain(value) {
  if (!value) return null;
  const url = value.startsWith("http") ? new URL(value) : new URL(`https://${value}`);
  return url.origin;
}

function audienceMatches(audience, expected) {
  const values = Array.isArray(audience) ? audience : [audience];
  return values.includes(expected);
}

async function importVerificationKey(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
}

export async function verifyAccessJwt(token, env, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!token || !env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) {
    throw new Error("Access authentication is not configured");
  }

  const segments = token.split(".");
  if (segments.length !== 3) throw new Error("Malformed Access token");

  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = decodeJsonSegment(encodedHeader);
  const payload = decodeJsonSegment(encodedPayload);
  const issuer = normalizeTeamDomain(env.CF_ACCESS_TEAM_DOMAIN);

  if (header.alg !== "ES256" || !header.kid) throw new Error("Unsupported Access token");
  if (payload.iss !== issuer || !audienceMatches(payload.aud, env.CF_ACCESS_AUD)) {
    throw new Error("Access token issuer or audience mismatch");
  }
  if (!Number.isFinite(payload.exp) || payload.exp <= nowSeconds) throw new Error("Access token expired");
  if (Number.isFinite(payload.nbf) && payload.nbf > nowSeconds + 30) throw new Error("Access token not active");

  const certsUrl = `${issuer}/cdn-cgi/access/certs`;
  const response = await fetch(certsUrl, { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!response.ok) throw new Error("Unable to load Access signing keys");
  const { keys = [] } = await response.json();
  const jwk = keys.find((candidate) => candidate.kid === header.kid);
  if (!jwk) throw new Error("Access signing key not found");

  const key = await importVerificationKey(jwk);
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    decodeBase64Url(encodedSignature),
    encoder.encode(`${encodedHeader}.${encodedPayload}`)
  );
  if (!valid) throw new Error("Invalid Access token signature");
  return payload;
}

function canonicalPlayer(claims) {
  const custom = claims.custom && typeof claims.custom === "object" ? claims.custom : {};
  const uuid = custom.minecraft_uuid ?? claims.minecraft_uuid;
  const name = custom.minecraft_name ?? claims.minecraft_name;
  if (!isCanonicalUuid(uuid)) return null;
  if (typeof name !== "string" || !/^[A-Za-z0-9_]{1,16}$/.test(name)) return null;
  return { uuid: uuid.toLowerCase(), name };
}

function claimRoles(claims) {
  const custom = claims.custom && typeof claims.custom === "object" ? claims.custom : {};
  const source = custom.roles ?? claims.roles ?? claims.groups ?? [];
  const values = Array.isArray(source) ? source : String(source).split(",");
  return values.map((role) => String(role).trim().toLowerCase()).filter(Boolean);
}

export function buildSession(claims) {
  const player = canonicalPlayer(claims);
  if (!player) throw new Error("Authenticated account is not linked to a canonical player");
  return Object.freeze({
    subject: String(claims.sub ?? ""),
    email: typeof claims.email === "string" ? claims.email : null,
    player: Object.freeze(player),
    roles: Object.freeze(claimRoles(claims))
  });
}

function configuredDiscordRoleIds(env, binding) {
  return new Set(
    String(env?.[binding] ?? "")
      .split(",")
      .map((roleId) => roleId.trim())
      .filter((roleId) => /^\d{16,22}$/.test(roleId))
  );
}

export function discordStaffRoles(session, env) {
  const assigned = new Set(
    Array.isArray(session?.guildRoleIds)
      ? session.guildRoleIds.map(String).filter((roleId) => /^\d{16,22}$/.test(roleId))
      : []
  );
  return DISCORD_STAFF_ROLE_BINDINGS
    .filter(([, binding]) => [...configuredDiscordRoleIds(env, binding)].some((roleId) => assigned.has(roleId)))
    .map(([role]) => role);
}

export function discordRoleSnapshotIsFresh(session, now = Date.now()) {
  const checkedAt = Date.parse(session?.discordRolesCheckedAt ?? "");
  return Number.isFinite(checkedAt)
    && checkedAt <= now + 5 * 60 * 1000
    && now - checkedAt <= DISCORD_ROLE_MAX_AGE_MS;
}

function linkedStaffPlayer(session) {
  for (const account of session?.linkedMinecraftAccounts ?? []) {
    const uuid = String(account?.uuid ?? "").trim().toLowerCase();
    const name = String(account?.name ?? "").trim();
    if (isCanonicalUuid(uuid) && /^[A-Za-z0-9_]{1,16}$/.test(name)) return { uuid, name };
  }
  return null;
}

export function buildDiscordStaffSession(session, env, now = Date.now()) {
  if (!session || session.discordGuildMember !== true) {
    throw new Error("Discord server membership is required");
  }
  if (!discordRoleSnapshotIsFresh(session, now)) {
    throw new Error("Discord staff roles must be refreshed");
  }
  const roles = discordStaffRoles(session, env);
  if (!roles.length) throw new Error("A configured Discord staff role is required");
  const player = linkedStaffPlayer(session);
  if (!player) throw new Error("A linked Minecraft account is required");
  return Object.freeze({
    ...session,
    player: Object.freeze(player),
    roles: Object.freeze(roles)
  });
}

export async function authenticateRequest(request, env, verifier = verifyAccessJwt) {
  let discordError = null;
  if (env?.COMPETITIONS_DB && typeof env.COMPETITIONS_DB.prepare === "function") {
    try {
      const identity = await getCompetitionIdentitySession(request, env.COMPETITIONS_DB);
      if (identity) {
        try {
          return buildDiscordStaffSession(identity, env);
        } catch (error) {
          discordError = error;
        }
      }
    } catch {
      // Access authentication remains available while the Discord session store is unavailable.
    }
  }
  const token = request.headers.get("CF-Access-Jwt-Assertion");
  try {
    const claims = await verifier(token, env);
    return buildSession(claims);
  } catch (error) {
    throw discordError ?? error;
  }
}

export function reviewerRoles(env) {
  return String(env.APPEAL_REVIEWER_ROLES ?? "admin,moderator")
    .split(",")
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean);
}

export function canReview(session, env) {
  const allowed = new Set(reviewerRoles(env));
  return session.roles.some((role) => allowed.has(role));
}

export { DISCORD_ROLE_MAX_AGE_MS };
