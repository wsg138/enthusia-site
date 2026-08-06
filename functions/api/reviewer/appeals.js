import { authenticateRequest, canReview } from "../../lib/auth.js";
import { forbidden, methodNotAllowed, serviceUnavailable, unauthorized } from "../../lib/responses.js";
import { reviewerRank, signedStaffRequest, staffApiResponse } from "../../lib/staff-api.js";

export async function onRequestGet(context) {
  let session;
  try { session = await authenticateRequest(context.request, context.env); } catch { return unauthorized(); }
  if (!canReview(session, context.env)) return forbidden();
  const actorRank = reviewerRank(session);
  if (!actorRank) return forbidden();

  const url = new URL(context.request.url);
  const status = url.searchParams.get("status")?.slice(0, 32) || "OPEN";
  const cursor = url.searchParams.get("cursor")?.slice(0, 128) || null;

  try {
    const upstream = await signedStaffRequest(context.env, "/v1/website/appeals/reviewer/list", {
      actorAccountId: session.player.uuid,
      actorRank,
      status,
      cursor,
      limit: 50,
    });
    return staffApiResponse(upstream);
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() { return methodNotAllowed(["GET"]); }
