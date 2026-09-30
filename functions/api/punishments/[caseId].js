import { canonicalCaseId, sanitizePublicPunishment } from "../../lib/public-punishment.js";
import { json, methodNotAllowed } from "../../lib/responses.js";
import { publicStaffRequest, staffApiResponse } from "../../lib/staff-api.js";

export async function onRequestGet(context) {
  const caseId = canonicalCaseId(context.params?.caseId);
  if (!caseId) return json({ error: "invalid_case_id" }, 400);

  try {
    const upstream = await publicStaffRequest(context.env, `/v1/public/cases/${caseId}`);
    if (!upstream.ok) return staffApiResponse(upstream, "no-store");
    const punishment = sanitizePublicPunishment(await upstream.json());
    if (!punishment) return json({ error: "invalid_punishment_projection" }, 502);
    return json(punishment, 200, {
      "cache-control": "public, max-age=20, stale-while-revalidate=40"
    });
  } catch {
    return json({ error: "punishment_service_unavailable" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}
