import { isCanonicalUuid } from "./validation.js";

const encoder = new TextEncoder();

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

export async function authenticateRequest(request, env, verifier = verifyAccessJwt) {
  const token = request.headers.get("CF-Access-Jwt-Assertion");
  const claims = await verifier(token, env);
  return buildSession(claims);
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
