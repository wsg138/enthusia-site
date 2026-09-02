import type { Env } from "./types";

const encoder = new TextEncoder();
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const MAX_EVENT_ID_LENGTH = 128;
const MAX_TIMESTAMP_LENGTH = 17;
const SIGNATURE_PREFIX = "v1=";
const SIGNATURE_HEX_LENGTH = 64;

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isDecimalTimestamp(value: string): boolean {
  if (value.length === 0 || value.length > MAX_TIMESTAMP_LENGTH) return false;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x30 || code > 0x39) return false;
  }
  return true;
}

function isPrintableEventId(value: string): boolean {
  if (value.length === 0 || value.length > MAX_EVENT_ID_LENGTH) return false;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x21 || code > 0x7e) return false;
  }
  return true;
}

function hexNibble(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  if (code >= 0x61 && code <= 0x66) return code - 0x61 + 10;
  return -1;
}

function decodeSignature(value: string): ArrayBuffer | null {
  if (!value.startsWith(SIGNATURE_PREFIX) || value.length !== SIGNATURE_PREFIX.length + SIGNATURE_HEX_LENGTH) {
    return null;
  }
  const bytes: number[] = [];
  for (let offset = SIGNATURE_PREFIX.length; offset < value.length; offset += 2) {
    const high = hexNibble(value.charCodeAt(offset));
    const low = hexNibble(value.charCodeAt(offset + 1));
    if (high < 0 || low < 0) return null;
    bytes.push((high << 4) | low);
  }
  return new Uint8Array(bytes).buffer;
}

export async function verifySignedRequest(
  request: Request,
  body: ArrayBuffer,
  env: Env,
  now = Date.now(),
): Promise<boolean> {
  const serverId = request.headers.get("X-Enthusia-Server-Id");
  const timestamp = request.headers.get("X-Enthusia-Timestamp");
  const eventId = request.headers.get("X-Enthusia-Event-Id");
  const supplied = request.headers.get("X-Enthusia-Signature");
  if (serverId === null || timestamp === null || eventId === null || supplied === null || serverId !== env.MARKET_SERVER_ID) return false;
  const suppliedBytes = decodeSignature(supplied);
  if (!isDecimalTimestamp(timestamp) || !isPrintableEventId(eventId) || suppliedBytes === null) return false;
  const timestampNumber = Number(timestamp);
  if (!Number.isSafeInteger(timestampNumber) || Math.abs(now - timestampNumber) > FIVE_MINUTES_MS) return false;
  const bodyHash = hex(await crypto.subtle.digest("SHA-256", body));
  const canonical = ["v1", request.method.toUpperCase(), new URL(request.url).pathname, serverId, timestamp, eventId, bodyHash].join("\n");
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.MARKET_SYNC_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, suppliedBytes, encoder.encode(canonical));
}
