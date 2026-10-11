const CASE_ID = /^[0-9A-HJKMNP-TV-Z]{16}$/;
const PLAYER = /^[A-Za-z0-9_]{3,16}$/;
const TOKEN = /^[A-Z0-9_:-]{1,64}$/;

function boundedText(value, maximum) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function instant(value) {
  if (value === null) return null;
  const text = boundedText(value, 64);
  if (!text || !Number.isFinite(Date.parse(text))) return undefined;
  return text;
}

export function canonicalCaseId(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return CASE_ID.test(normalized) ? normalized : null;
}

function validPublicTokens(fields) {
  return PLAYER.test(fields.player) && TOKEN.test(fields.punishmentType) && TOKEN.test(fields.state);
}

function validRemainingSeconds(value) {
  return value === null || (Number.isSafeInteger(value) && value >= 0);
}

function validCursor(value) {
  return value === null || (typeof value === "string" && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value));
}

export function sanitizePublicPunishment(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const player = boundedText(value.player, 16);
  const punishmentType = boundedText(value.punishmentType, 64)?.toUpperCase();
  const broadReason = boundedText(value.broadReason, 500);
  const publicReason = boundedText(value.publicReason, 1000);
  const issuedAt = instant(value.issuedAt);
  const expiresAt = instant(value.expiresAt);
  const state = boundedText(value.state, 64)?.toUpperCase();
  const caseId = canonicalCaseId(value.caseId);
  const remainingSeconds = value.remainingSeconds;

  const fields = { player, punishmentType, broadReason, publicReason, issuedAt, state, caseId };
  if (!Object.values(fields).every(Boolean)) return null;
  if (!validPublicTokens(fields)) return null;
  if (expiresAt === undefined || typeof value.appealAvailable !== "boolean") return null;
  if (!validRemainingSeconds(remainingSeconds)) return null;

  return Object.freeze({
    player,
    punishmentType,
    broadReason,
    publicReason,
    issuedAt,
    expiresAt,
    remainingSeconds,
    state,
    caseId,
    appealAvailable: value.appealAvailable
  });
}

export function sanitizePublicPunishmentCollection(value, includeCursor = false) {
  if (!value || typeof value !== "object" || !Array.isArray(value.items)) return null;
  const items = value.items.map(sanitizePublicPunishment);
  if (items.some((item) => !item)) return null;
  if (!includeCursor) return Object.freeze({ items });

  const nextCursor = value.nextCursor;
  if (!validCursor(nextCursor)) return null;
  return Object.freeze({ items, nextCursor });
}
