import { authenticateRequest } from "../../../lib/auth.js";
import { json, methodNotAllowed, serviceUnavailable, unauthorized } from "../../../lib/responses.js";
import { boundedIdempotencyKey, requireSameOrigin } from "../../../lib/security.js";
import { signedStaffRequest, staffApiResponse } from "../../../lib/staff-api.js";
import { isCanonicalUuid } from "../../../lib/validation.js";

const MIN_REASON_LENGTH = 10;
const MAX_REASON_LENGTH = 1000;

function inputText(input, field) {
  return typeof input?.[field] === "string" ? input[field].trim() : "";
}

function sanitizeEdit(input) {
  const reason = inputText(input, "reason");
  if (reason.length < MIN_REASON_LENGTH || reason.length > MAX_REASON_LENGTH) return null;
  const expectedVersion = Number(input?.expectedVersion);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) return null;
  const idempotencyKey = boundedIdempotencyKey(input?.idempotencyKey);
  if (!idempotencyKey) return null;
  return { reason, expectedVersion, idempotencyKey };
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  let session;
  try { session = await authenticateRequest(context.request, context.env); } catch { return unauthorized(); }

  let edit;
  try { edit = sanitizeEdit(await context.request.json()); } catch { edit = null; }
  const appealId = String(context.params.id ?? "").trim();
  if (!edit || !isCanonicalUuid(appealId)) return json({ error: "invalid_edit" }, 400);

  try {
    return staffApiResponse(
      await signedStaffRequest(context.env, `/v1/website/appeals/${appealId}/edit`, {
        accountId: session.player.uuid,
        expectedVersion: edit.expectedVersion,
        reason: edit.reason,
        idempotencyKey: edit.idempotencyKey
      }),
      "private, no-store"
    );
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() { return methodNotAllowed(["POST"]); }
export { sanitizeEdit };
