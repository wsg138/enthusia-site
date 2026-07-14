import { DurableObject } from "cloudflare:workers";
import { EXPECTED_STALL_SET, NATURAL_STALL_IDS } from "./expected-stalls";
import { error, json } from "./responses";
import type { Stall } from "./schemas";
import type { Env, StoredEvent } from "./types";

type Meta = {
  active_generation: string;
  server_epoch: string;
  snapshot_revision: string;
  sequence: string;
  generated_at: string;
  updated_at: string;
  last_full_sync_at: string;
  stall_count: string;
};

type StallRow = { stall_id: string; revision: number; updated_at: string; payload_json: string };
type EventRow = { sequence: number; event_json: string };
type DuplicateRow = { response_json: string };

const DEFAULT_META: Meta = {
  active_generation: "0", server_epoch: "", snapshot_revision: "0", sequence: "0",
  generated_at: "", updated_at: "", last_full_sync_at: "", stall_count: "0",
};

export class EnthusiaMarketRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS stalls (
          generation INTEGER NOT NULL,
          stall_id TEXT NOT NULL,
          revision INTEGER NOT NULL,
          updated_at TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          PRIMARY KEY (generation, stall_id)
        );
        CREATE TABLE IF NOT EXISTS events (
          event_id TEXT PRIMARY KEY,
          sequence INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          event_json TEXT NOT NULL,
          response_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS events_sequence_idx ON events(sequence);
      `);
      for (const [key, value] of Object.entries(DEFAULT_META)) {
        ctx.storage.sql.exec("INSERT OR IGNORE INTO meta(key, value) VALUES (?, ?)", key, value);
      }
    });
  }

  private meta(): Meta {
    const result = { ...DEFAULT_META };
    for (const row of this.ctx.storage.sql.exec<{ key: keyof Meta; value: string }>("SELECT key, value FROM meta")) result[row.key] = row.value;
    return result;
  }

  private setMeta(values: Partial<Meta>): void {
    for (const [key, value] of Object.entries(values)) this.ctx.storage.sql.exec("UPDATE meta SET value = ? WHERE key = ?", value, key);
  }

  private first<T extends Record<string, SqlStorageValue>>(query: string, ...bindings: unknown[]): T | undefined {
    return this.ctx.storage.sql.exec<T>(query, ...bindings).toArray()[0];
  }

  private duplicate(eventId: string): Response | null {
    const row = this.first<DuplicateRow>("SELECT response_json FROM events WHERE event_id = ?", eventId);
    return row ? json(JSON.parse(row.response_json)) : null;
  }

  private persistEvent(eventId: string, event: StoredEvent, response: unknown, now: string): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO events(event_id, sequence, created_at, event_json, response_json) VALUES (?, ?, ?, ?, ?)",
      eventId, event.sequence, now, JSON.stringify(event), JSON.stringify(response),
    );
    this.ctx.storage.sql.exec("DELETE FROM events WHERE sequence <= ?", event.sequence - 1000);
  }

  private broadcast(event: StoredEvent): void {
    const message = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(message); } catch { try { socket.close(1011, "Delivery failed"); } catch { /* disconnected */ } }
    }
  }

  private async fullSync(request: Request): Promise<Response> {
    const body = await request.json<{
      serverEpoch: string; eventId: string; snapshotRevision: number; generatedAt: string;
      stalls: Array<{ revision: number; stall: Stall }>;
    }>();
    const duplicate = this.duplicate(body.eventId);
    if (duplicate) return duplicate;
    const meta = this.meta();
    if (meta.server_epoch === body.serverEpoch && body.snapshotRevision <= Number(meta.snapshot_revision)) {
      return error("stale_snapshot", "Snapshot revision is not newer than the active snapshot.", 409);
    }
    const now = new Date().toISOString();
    const generation = Number(meta.active_generation) + 1;
    this.ctx.storage.sql.exec("DELETE FROM stalls WHERE generation = ?", generation);
    for (const entry of body.stalls) {
      this.ctx.storage.sql.exec(
        "INSERT INTO stalls(generation, stall_id, revision, updated_at, payload_json) VALUES (?, ?, ?, ?, ?)",
        generation, entry.stall.id, entry.revision, now, JSON.stringify(entry.stall),
      );
    }
    const inserted = this.first<{ count: number }>("SELECT COUNT(*) AS count FROM stalls WHERE generation = ?", generation)?.count ?? 0;
    if (inserted !== 71) return error("storage_failure", "Complete generation could not be prepared.", 500);
    const sequence = Number(meta.sequence) + 1;
    const event: StoredEvent = { type: "market.replaced", schemaVersion: 1, sequence, snapshotRevision: body.snapshotRevision, generatedAt: body.generatedAt };
    const response = { ok: true, applied: true, duplicate: false, sequence, snapshotRevision: body.snapshotRevision, stallCount: inserted };
    this.ctx.storage.transactionSync(() => {
      this.setMeta({
        active_generation: String(generation), server_epoch: body.serverEpoch,
        snapshot_revision: String(body.snapshotRevision), sequence: String(sequence),
        generated_at: body.generatedAt, updated_at: now, last_full_sync_at: now, stall_count: String(inserted),
      });
      this.persistEvent(body.eventId, event, response, now);
    });
    this.ctx.storage.sql.exec("DELETE FROM stalls WHERE generation <> ?", generation);
    this.broadcast(event);
    return json(response);
  }

  private async stallUpdate(request: Request, stallId: string): Promise<Response> {
    const body = await request.json<{ serverEpoch: string; eventId: string; revision: number; stall: Stall }>();
    const duplicate = this.duplicate(body.eventId);
    if (duplicate) return duplicate;
    const meta = this.meta();
    if (!Number(meta.active_generation)) return error("market_not_initialized", "Market data has not been synchronized yet.", 409);
    if (body.serverEpoch !== meta.server_epoch) return error("epoch_mismatch", "Server epoch does not match the active epoch.", 409);
    const row = this.first<StallRow>(
      "SELECT stall_id, revision, updated_at, payload_json FROM stalls WHERE generation = ? AND stall_id = ?",
      Number(meta.active_generation), stallId,
    );
    if (!row) return error("stall_not_found", "Stall was not found.", 404);
    if (body.revision <= row.revision) return error("stale_revision", "Stall revision is not newer than the active revision.", 409);
    const now = new Date().toISOString();
    const sequence = Number(meta.sequence) + 1;
    const event: StoredEvent = { type: "stall.updated", schemaVersion: 1, sequence, stallId, revision: body.revision, updatedAt: now, stall: body.stall };
    const response = { ok: true, applied: true, duplicate: false, sequence, stallId, revision: body.revision };
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "UPDATE stalls SET revision = ?, updated_at = ?, payload_json = ? WHERE generation = ? AND stall_id = ?",
        body.revision, now, JSON.stringify(body.stall), Number(meta.active_generation), stallId,
      );
      this.setMeta({ sequence: String(sequence), updated_at: now });
      this.persistEvent(body.eventId, event, response, now);
    });
    this.broadcast(event);
    return json(response);
  }

  private market(): Response {
    const meta = this.meta();
    if (!Number(meta.active_generation)) return error("market_not_initialized", "Market data has not been synchronized yet.", 503, { "Cache-Control": "no-store" });
    const rows = this.ctx.storage.sql.exec<StallRow>(
      "SELECT stall_id, revision, updated_at, payload_json FROM stalls WHERE generation = ?", Number(meta.active_generation),
    ).toArray();
    const byId = new Map(rows.map((row) => [row.stall_id, JSON.parse(row.payload_json)]));
    return json({
      schemaVersion: 1, serverId: this.env.MARKET_SERVER_ID, serverEpoch: meta.server_epoch,
      snapshotRevision: Number(meta.snapshot_revision), sequence: Number(meta.sequence), generatedAt: meta.generated_at,
      updatedAt: meta.updated_at, stallCount: rows.length, stalls: NATURAL_STALL_IDS.map((id) => byId.get(id)),
    }, 200, { "Cache-Control": "no-cache, no-store, must-revalidate" });
  }

  private stall(request: Request, stallId: string): Response {
    if (!EXPECTED_STALL_SET.has(stallId)) return error("stall_not_found", "Stall was not found.", 404, { "Cache-Control": "no-store" });
    const meta = this.meta();
    if (!Number(meta.active_generation)) return error("market_not_initialized", "Market data has not been synchronized yet.", 503, { "Cache-Control": "no-store" });
    const row = this.first<StallRow>(
      "SELECT stall_id, revision, updated_at, payload_json FROM stalls WHERE generation = ? AND stall_id = ?",
      Number(meta.active_generation), stallId,
    );
    if (!row) return error("stall_not_found", "Stall was not found.", 404, { "Cache-Control": "no-store" });
    const etag = `\"${meta.sequence}-${row.revision}\"`;
    if (request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-cache, no-store, must-revalidate" } });
    return json({ schemaVersion: 1, sequence: Number(meta.sequence), stallId, revision: row.revision, updatedAt: row.updated_at, stall: JSON.parse(row.payload_json) }, 200, { ETag: etag, "Cache-Control": "no-cache, no-store, must-revalidate" });
  }

  private health(): Response {
    const meta = this.meta();
    return json({
      ok: true, service: "enthusia-market-api", schemaVersion: 1,
      storage: { durableObject: "ready", r2: "bound" },
      market: { initialized: Number(meta.active_generation) > 0, stallCount: Number(meta.stall_count), sequence: Number(meta.sequence) },
      time: new Date().toISOString(),
    }, 200, { "Cache-Control": "no-store" });
  }

  private live(request: Request): Response {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ connectedAt: new Date().toISOString() });
    const meta = this.meta();
    server.send(JSON.stringify({
      type: "hello", schemaVersion: 1, initialized: Number(meta.active_generation) > 0,
      sequence: Number(meta.sequence), serverEpoch: meta.server_epoch || null, snapshotRevision: Number(meta.snapshot_revision),
    }));
    const rawSince = new URL(request.url).searchParams.get("since");
    if (rawSince !== null && /^\d+$/.test(rawSince)) {
      const since = Number(rawSince);
      const current = Number(meta.sequence);
      const oldest = this.first<{ sequence: number }>("SELECT MIN(sequence) AS sequence FROM events WHERE sequence > 0")?.sequence;
      if (since < current && (oldest === undefined || since < oldest - 1)) {
        server.send(JSON.stringify({ type: "resync_required", reason: "history_unavailable", sequence: current }));
      } else {
        for (const row of this.ctx.storage.sql.exec<EventRow>("SELECT sequence, event_json FROM events WHERE sequence > ? ORDER BY sequence", since)) {
          server.send(row.event_json);
        }
      }
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return this.health();
    if (url.pathname === "/v1/market") return this.market();
    if (url.pathname === "/v1/live") return this.live(request);
    const publicStall = /^\/v1\/stalls\/([^/]+)$/.exec(url.pathname);
    if (publicStall) return this.stall(request, decodeURIComponent(publicStall[1]));
    if (request.headers.get("X-Enthusia-Authenticated") !== "1") return error("unauthorized", "Request authentication failed.", 401);
    if (url.pathname === "/internal/v1/full-sync") return this.fullSync(request);
    const privateStall = /^\/internal\/v1\/stalls\/([^/]+)$/.exec(url.pathname);
    if (privateStall) return this.stallUpdate(request, decodeURIComponent(privateStall[1]));
    return error("not_found", "Route not found.", 404);
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message === "string" && message === "ping") socket.send("pong");
  }

  webSocketClose(_socket: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {}
  webSocketError(_socket: WebSocket, _error: unknown): void {}
}
