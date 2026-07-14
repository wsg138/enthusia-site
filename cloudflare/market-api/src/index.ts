import { verifySignedRequest } from "./auth";
import { EnthusiaMarketRoom } from "./market-room";
import { error, json, withPublicCors } from "./responses";
import { fullSyncSchema, stallUpdateSchema, testRequestSchema, validateRouteStall } from "./schemas";
import type { Env } from "./types";
import {
  eventRelationshipIssue,
  logValidationSummary,
  summarizeValidationIssues,
  type SafeValidationSummary,
} from "./validation-diagnostics";

export { EnthusiaMarketRoom };

const LIMITS = {
  "/internal/v1/test": 32 * 1024,
  "/internal/v1/full-sync": 4 * 1024 * 1024,
  stall: 256 * 1024,
};

function allowedOrigins(env: Env): Set<string> {
  return new Set([env.PUBLIC_SITE_ORIGIN, env.EXPERIMENTAL_SITE_ORIGIN]);
}

function durableObject(env: Env): DurableObjectStub {
  return env.MARKET_ROOM.get(env.MARKET_ROOM.idFromName(env.MARKET_OBJECT_NAME));
}

function routeLimit(pathname: string): number | null {
  if (pathname === "/internal/v1/test") return LIMITS["/internal/v1/test"];
  if (pathname === "/internal/v1/full-sync") return LIMITS["/internal/v1/full-sync"];
  if (/^\/internal\/v1\/stalls\/[^/]+$/.test(pathname)) return LIMITS.stall;
  return null;
}

function internalMethod(pathname: string): string | null {
  if (pathname === "/internal/v1/test" || pathname === "/internal/v1/full-sync") return "POST";
  if (/^\/internal\/v1\/stalls\/[^/]+$/.test(pathname)) return "PUT";
  return null;
}

async function readLimitedBody(request: Request, limit: number): Promise<ArrayBuffer | Response> {
  const declared = request.headers.get("Content-Length");
  if (declared && Number(declared) > limit) return error("payload_too_large", "Request payload exceeds the route limit.", 413);
  const body = await request.arrayBuffer();
  if (body.byteLength > limit) return error("payload_too_large", "Request payload exceeds the route limit.", 413);
  return body;
}

async function handleInternal(request: Request, env: Env, pathname: string): Promise<Response> {
  const expectedMethod = internalMethod(pathname);
  if (!expectedMethod) return error("not_found", "Route not found.", 404);
  if (request.method !== expectedMethod) return error("method_not_allowed", "Method not allowed.", 405, { Allow: expectedMethod });
  if (!(request.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/json")) {
    return error("unsupported_media_type", "Content-Type must be application/json.", 415);
  }
  const limit = routeLimit(pathname)!;
  const read = await readLimitedBody(request, limit);
  if (read instanceof Response) return read;
  if (!(await verifySignedRequest(request, read, env))) return error("unauthorized", "Request authentication failed.", 401);

  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(read));
  } catch {
    return error("invalid_json", "Request body must contain valid JSON.", 400);
  }
  const eventHeader = request.headers.get("X-Enthusia-Event-Id");
  const invalidRequest = (summary: SafeValidationSummary): Response => {
    logValidationSummary(pathname, summary);
    return json({
      ok: false,
      error: {
        code: "invalid_request",
        message: "Request validation failed.",
        diagnostic: summary,
      },
    }, 400);
  };
  if (pathname === "/internal/v1/test") {
    const parsed = testRequestSchema.safeParse(data);
    if (!parsed.success) return invalidRequest(summarizeValidationIssues(parsed.error.issues, data));
    if (parsed.data.eventId !== eventHeader) return invalidRequest(eventRelationshipIssue("eventId"));
    return json({ ok: true, authenticated: true, serverId: env.MARKET_SERVER_ID, serverTime: new Date().toISOString() }, 200, { "Cache-Control": "no-store" });
  }
  if (pathname === "/internal/v1/full-sync") {
    const parsed = fullSyncSchema.safeParse(data);
    if (!parsed.success) return invalidRequest(summarizeValidationIssues(parsed.error.issues, data));
    if (parsed.data.eventId !== eventHeader) return invalidRequest(eventRelationshipIssue("eventId"));
  } else {
    const parsed = stallUpdateSchema.safeParse(data);
    const stallId = decodeURIComponent(pathname.slice("/internal/v1/stalls/".length));
    if (!parsed.success) return invalidRequest(summarizeValidationIssues(parsed.error.issues, data));
    if (parsed.data.eventId !== eventHeader) return invalidRequest(eventRelationshipIssue("eventId"));
    if (!validateRouteStall(stallId, parsed.data.stall)) return invalidRequest(eventRelationshipIssue("stall.id"));
  }
  const headers = new Headers(request.headers);
  headers.set("X-Enthusia-Authenticated", "1");
  return durableObject(env).fetch(new Request(request.url, { method: request.method, headers, body: read }));
}

function isPublicPath(pathname: string): boolean {
  return pathname === "/health" || pathname === "/v1/market" || pathname === "/v1/live" || /^\/v1\/stalls\/[^/]+$/.test(pathname);
}

async function handlePublic(request: Request, env: Env, pathname: string): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins(env).has(origin)) return withPublicCors(error("origin_not_allowed", "Origin is not allowed.", 403), null);
  if (request.method === "OPTIONS") {
    const headers: HeadersInit = {
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "If-None-Match",
      "Access-Control-Max-Age": "86400",
      "Cache-Control": "no-store",
    };
    return withPublicCors(new Response(null, { status: 204, headers }), origin);
  }
  if (request.method !== "GET") return withPublicCors(error("method_not_allowed", "Method not allowed.", 405, { Allow: "GET, OPTIONS" }), origin);
  if (pathname === "/v1/live") {
    if ((request.headers.get("Upgrade") ?? "").toLowerCase() !== "websocket") {
      return withPublicCors(error("upgrade_required", "A WebSocket upgrade is required.", 426, { Upgrade: "websocket" }), origin);
    }
    return durableObject(env).fetch(request);
  }
  const response = await durableObject(env).fetch(request);
  return withPublicCors(response, origin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const pathname = new URL(request.url).pathname;
      if (pathname.startsWith("/internal/")) return await handleInternal(request, env, pathname);
      if (isPublicPath(pathname)) return await handlePublic(request, env, pathname);
      return error("not_found", "Route not found.", 404, { "Cache-Control": "no-store" });
    } catch {
      return error("internal_error", "The request could not be completed.", 500, { "Cache-Control": "no-store" });
    }
  },
} satisfies ExportedHandler<Env>;
