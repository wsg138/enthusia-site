import { authenticateRequest, canReview } from "../../lib/auth.js";
import { appealLifecycleByIds } from "../../lib/appeal-lifecycle-repository.js";
import { appealDetailsByIds } from "../../lib/appeal-repository.js";
import { forbidden, json, methodNotAllowed, serviceUnavailable, unauthorized } from "../../lib/responses.js";
import { reviewerRank, signedStaffRequest, staffApiResponse } from "../../lib/staff-api.js";

const REOPEN_RANKS = new Set(["ADMIN", "FOUNDER"]);

async function localAppealDetails(db, appealIds) {
  if (!db) return { content: null, lifecycle: null };
  try {
    const [content, lifecycle] = await Promise.all([
      appealDetailsByIds(db, appealIds),
      appealLifecycleByIds(db, appealIds)
    ]);
    return { content, lifecycle };
  } catch {
    return { content: null, lifecycle: null };
  }
}

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
      limit: 50
    });
    if (!upstream.ok) return staffApiResponse(upstream);
    let payload;
    try { payload = await upstream.json(); } catch { return serviceUnavailable(); }
    if (!Array.isArray(payload?.appeals)) return serviceUnavailable();

    const appealIds = payload.appeals.map((appeal) => appeal.id);
    const local = await localAppealDetails(context.env?.COMPETITIONS_DB, appealIds);
    const detailsAvailable = local.content !== null;
    return json({
      ...payload,
      canReopen: REOPEN_RANKS.has(actorRank),
      appeals: payload.appeals.map((appeal) => {
        const full = local.content?.get(appeal.id);
        const lifecycle = local.lifecycle?.get(appeal.id);
        if (full) {
          return {
            ...appeal,
            claimed: lifecycle?.claimed ?? null,
            structuredAnswers: full.answers,
            attachments: full.attachments,
            comments: full.comments,
            detailsState: "COMPLETE"
          };
        }
        return {
          ...appeal,
          claimed: lifecycle?.claimed ?? null,
          structuredAnswers: null,
          attachments: [],
          comments: [],
          detailsState: detailsAvailable ? "LEGACY" : "UNAVAILABLE"
        };
      })
    });
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() { return methodNotAllowed(["GET"]); }

export { localAppealDetails };
