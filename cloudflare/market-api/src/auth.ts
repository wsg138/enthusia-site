import type { Env } from "./types";

const encoder = new TextEncoder();
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const EVENT_ID = /^[\x21-\x7e]{1,128}$/;
const SIGNATURE = /^v1=([0-9a-f]{64})$/;

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
  if (!serverId || !timestamp || !eventId || !supplied || serverId !== env.MARKET_SERVER_ID) return false;
  if (!/^\d{1,17}$/.test(timestamp) || !EVENT_ID.test(eventId) || !SIGNATURE.test(supplied)) return false;
  const timestampNumber = Number(timestamp);
  if (!Number.isSafeInteger(timestampNumber) || Math.abs(now - timestampNumber) > FIVE_MINUTES_MS) return false;
  const bodyHash = hex(await crypto.subtle.digest("SHA-256", body));
  const canonical = ["v1", request.method.toUpperCase(), new URL(request.url).pathname, serverId, timestamp, eventId, bodyHash].join("\n");
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.MARKET_SYNC_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expectedBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(canonical)));
  const suppliedHex = SIGNATURE.exec(supplied)?.[1] ?? "";
  const suppliedBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) suppliedBytes[i] = Number.parseInt(suppliedHex.slice(i * 2, i * 2 + 2), 16);
  let difference = 0;
  for (let i = 0; i < expectedBytes.length; i++) difference |= expectedBytes[i] ^ suppliedBytes[i];
  return difference === 0;
}
