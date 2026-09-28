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

  if (!player || !PLAYER.test(player)
      || !punishmentType || !TOKEN.test(punishmentType)
      || !broadReason || !publicReason
      || !issuedAt || expiresAt === undefined
      || !state || !TOKEN.test(state)
      || !caseId || typeof value.appealAvailable !== "boolean"
      || (remainingSeconds !== null
        && (!Number.isSafeInteger(remainingSeconds) || remainingSeconds < 0))) {
    return null;
  }

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
  if (nextCursor !== null
      && (typeof nextCursor !== "string"
        || nextCursor.length > 128
        || !/^[A-Za-z0-9_-]+$/.test(nextCursor))) {
    return null;
  }
  return Object.freeze({ items, nextCursor });
}
