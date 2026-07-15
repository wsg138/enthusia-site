import { SELF } from "cloudflare:test";
import { EXPECTED_STALL_IDS } from "../src/expected-stalls";
import type { Stall } from "../src/schemas";

export const TEST_SECRET = "local-test-secret-with-sufficient-entropy";
const SERVER_ID = "enthusia-main";
const encoder = new TextEncoder();

export function makeStall(id: string): Stall {
  return {
    id,
    buildingId: "building-1",
    floor: 1,
    location: { world: "world", x: 1, y: 64, z: 2 },
    owner: { type: "NONE", id: null, uuid: null, name: "Unowned stall", avatarUrl: null, avatar: { kind: "NONE" } },
    ownerSince: null,
    nextRentAt: null,
    stallState: "UNOWNED",
    graceEndsAt: null,
    rentTimingStatus: "NOT_APPLICABLE",
    members: [],
    shops: [],
  };
}

export function fullSyncBody(snapshotRevision = 1, epoch = crypto.randomUUID(), eventId = crypto.randomUUID()) {
  return {
    schemaVersion: 1 as const,
    serverId: SERVER_ID,
    serverEpoch: epoch,
    eventId,
    sentAt: new Date().toISOString(),
    snapshotRevision,
    generatedAt: new Date().toISOString(),
    stalls: EXPECTED_STALL_IDS.map((id) => ({ revision: snapshotRevision, stall: makeStall(id) })),
  };
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function signature(method: string, pathname: string, body: string, timestamp: string, eventId: string, secret = TEST_SECRET): Promise<string> {
  const bodyHash = hex(await crypto.subtle.digest("SHA-256", encoder.encode(body)));
  const canonical = ["v1", method, pathname, SERVER_ID, timestamp, eventId, bodyHash].join("\n");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `v1=${hex(await crypto.subtle.sign("HMAC", key, encoder.encode(canonical)))}`;
}

export async function signedFetch(pathname: string, method: "POST" | "PUT", data: Record<string, unknown>, options: {
  timestamp?: string; signedPath?: string; secret?: string; serverId?: string; signature?: string; omit?: string; headerEventId?: string;
} = {}): Promise<Response> {
  const body = JSON.stringify(data);
  const timestamp = options.timestamp ?? String(Date.now());
  const eventId = options.headerEventId ?? String(data.eventId);
  const headers = new Headers({ "Content-Type": "application/json" });
  const values: Record<string, string> = {
    "X-Enthusia-Server-Id": options.serverId ?? SERVER_ID,
    "X-Enthusia-Timestamp": timestamp,
    "X-Enthusia-Event-Id": eventId,
    "X-Enthusia-Signature": options.signature ?? await signature(method, options.signedPath ?? pathname, body, timestamp, eventId, options.secret),
  };
  for (const [name, value] of Object.entries(values)) if (name !== options.omit) headers.set(name, value);
  return SELF.fetch(`https://example.test${pathname}`, { method, headers, body });
}

export async function initialize(snapshotRevision = 1, epoch = crypto.randomUUID()) {
  const body = fullSyncBody(snapshotRevision, epoch);
  const response = await signedFetch("/internal/v1/full-sync", "POST", body);
  return { body, response, result: await response.json<Record<string, unknown>>() };
}

export async function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WebSocket message timeout")), 2000);
    socket.addEventListener("message", (event) => {
      clearTimeout(timeout);
      resolve(JSON.parse(String(event.data)));
    }, { once: true });
  });
}
