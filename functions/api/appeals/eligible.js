import { authenticateAppealRequest } from "../../lib/appeal-session.js";
import { methodNotAllowed, serviceUnavailable, unauthorized } from "../../lib/responses.js";
import { signedStaffRequest, staffApiResponse } from "../../lib/staff-api.js";

export async function onRequestGet(context) {
  let session;
  try { session = await authenticateAppealRequest(context.request, context.env); } catch { return unauthorized(); }

  try {
    const upstream = await signedStaffRequest(context.env, "/v1/website/appeals/eligible", {
      accountId: session.accountId,
    });
    return staffApiResponse(upstream, "private, no-store");
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() { return methodNotAllowed(["GET"]); }
