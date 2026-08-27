const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTIFIER_CHARACTERS = new Set(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:-"
);
const IDENTIFIER_CHARACTERS_WITHOUT_COLON = new Set(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-"
);

export function isCanonicalUuid(value) {
  return typeof value === "string" && CANONICAL_UUID.test(value);
}

export function isSafeIdentifier(value, {
  minLength = 1,
  maxLength = 128,
  allowColon = true
} = {}) {
  if (typeof value !== "string") return false;
  if (value.length < minLength || value.length > maxLength) return false;
  const characters = allowColon ? IDENTIFIER_CHARACTERS : IDENTIFIER_CHARACTERS_WITHOUT_COLON;
  return [...value].every((character) => characters.has(character));
}

export { CANONICAL_UUID };
