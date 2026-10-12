export function serializeJsonDocument(value) {
  // Stored JSON documents do not depend on object key ordering.
  return JSON.stringify(value); // nosemgrep: javascript.lang.correctness.no-stringify-keys.no-stringify-keys
}
