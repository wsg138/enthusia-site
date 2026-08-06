import { authenticateRequest } from "../../lib/auth.js";
import { methodNotAllowed, serviceUnavailable, unauthorized } from "../../lib/responses.js";

export async function onRequestGet(context) {
  let session;
  try { session = await authenticateRequest(context.request, context.env); } catch { return unauthorized(); }
  if (!context.env.APPEALS_API?.fetch) return serviceUnavailable();

  const upstream = await context.env.APPEALS_API.fetch("https://staff.internal/appeals/eligible", {
    headers: {
      "x-enthusia-player-uuid": session.player.uuid,
      "x-enthusia-player-subject": session.subject,
    },
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "private, no-store" },
  });
}

export function onRequest() { return methodNotAllowed(["GET"]); }
