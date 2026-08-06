import { authenticateRequest, canReview } from "../../lib/auth.js";
import { forbidden, methodNotAllowed, serviceUnavailable, unauthorized } from "../../lib/responses.js";

export async function onRequestGet(context) {
  let session;
  try {
    session = await authenticateRequest(context.request, context.env);
  } catch {
    return unauthorized();
  }
  if (!canReview(session, context.env)) return forbidden();
  if (!context.env.APPEALS_API?.fetch) return serviceUnavailable();

  const url = new URL(context.request.url);
  const upstreamUrl = new URL("https://staff.internal/reviewer/appeals");
  for (const key of ["status", "cursor"]) {
    const value = url.searchParams.get(key);
    if (value) upstreamUrl.searchParams.set(key, value.slice(0, 128));
  }

  const upstream = await context.env.APPEALS_API.fetch(upstreamUrl, {
    headers: {
      "x-enthusia-reviewer-subject": session.subject,
      "x-enthusia-reviewer-player": session.player.uuid,
    },
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
  });
}

export function onRequest(context) {
  return methodNotAllowed(["GET"]);
}
