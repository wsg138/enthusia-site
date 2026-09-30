import { sanitizeAppealEdit, projectAppealMutation } from "../../../../lib/appeal-lifecycle.js";
import {
  findOwnedAppealLifecycle,
  recordAppealEditMirror
} from "../../../../lib/appeal-lifecycle-repository.js";
import { authenticateLinkedAppealRequest } from "../../../../lib/appeal-session.js";
import { json, methodNotAllowed, serviceUnavailable, unauthorized } from "../../../../lib/responses.js";
import { requireSameOrigin } from "../../../../lib/security.js";
import { signedStaffRequest, staffApiResponse } from "../../../../lib/staff-api.js";
import { isCanonicalUuid } from "../../../../lib/validation.js";

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  if (!context.env?.COMPETITIONS_DB) return serviceUnavailable();
  const appealId = String(context.params.id ?? "").trim().toLowerCase();
  if (!isCanonicalUuid(appealId)) return json({ error: "invalid_appeal" }, 400);

  let session;
  try { session = await authenticateLinkedAppealRequest(context.request, context.env); }
  catch { return serviceUnavailable(); }
  if (!session) return unauthorized();

  let input;
  try { input = sanitizeAppealEdit(await context.request.json()); }
  catch { input = null; }
  if (!input) return json({ error: "invalid_appeal_edit" }, 400);

  try {
    const local = await findOwnedAppealLifecycle(context.env.COMPETITIONS_DB, session.discord.id, appealId);
    if (!local) return json({ error: "appeal_not_found" }, 404);
    if (local.status !== "OPEN" || local.claimed) return json({ error: "appeal_edit_locked" }, 409);
    if (local.version !== input.expectedVersion) return json({ error: "stale_appeal_state" }, 409);

    const upstream = await signedStaffRequest(context.env, `/v1/website/appeals/${appealId}/edit`, {
      accountId: session.accountId,
      expectedVersion: input.expectedVersion,
      reason: input.staffReason,
      idempotencyKey: input.idempotencyKey
    });
    if (!upstream.ok) return staffApiResponse(upstream, "private, no-store");

    let payload;
    try { payload = await upstream.json(); } catch { return serviceUnavailable(); }
    const appeal = projectAppealMutation(payload, appealId);
    if (!appeal || appeal.claimed || appeal.status !== "OPEN") return serviceUnavailable();

    const mirrored = await recordAppealEditMirror(context.env.COMPETITIONS_DB, {
      ownerDiscordId: session.discord.id,
      appealId,
      answers: input.answers,
      staffReason: input.staffReason,
      version: appeal.version,
      updatedAt: appeal.updatedAt ?? new Date().toISOString()
    });
    if (!mirrored) return serviceUnavailable();
    return json({ appeal }, 200, { "cache-control": "private, no-store" });
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() { return methodNotAllowed(["POST"]); }
