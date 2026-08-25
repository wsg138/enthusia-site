import { authenticateRequest, canReview } from "../../lib/auth.js";
import { appealDetailsByIds } from "../../lib/appeal-repository.js";
import { forbidden, json, methodNotAllowed, serviceUnavailable, unauthorized } from "../../lib/responses.js";
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
    if (!upstream.ok) return staffApiResponse(upstream);
    let payload;
    try { payload = await upstream.json(); } catch { return serviceUnavailable(); }
    if (!Array.isArray(payload?.appeals)) return serviceUnavailable();

    let details = null;
    if (context.env?.COMPETITIONS_DB) {
      try {
        details = await appealDetailsByIds(
          context.env.COMPETITIONS_DB,
          payload.appeals.map((appeal) => appeal.id)
        );
      } catch {
        details = null;
      }
    }
    const detailsAvailable = details !== null;
    return json({
      ...payload,
      appeals: payload.appeals.map((appeal) => {
        const full = details?.get(appeal.id);
        if (full) {
          return { ...appeal, structuredAnswers: full.answers, attachments: full.attachments, detailsState: "COMPLETE" };
        }
        return { ...appeal, structuredAnswers: null, attachments: [], detailsState: detailsAvailable ? "LEGACY" : "UNAVAILABLE" };
      })
    });
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() { return methodNotAllowed(["GET"]); }
