import {
  appealAttachmentLimits,
  deleteAppealAttachment,
  inspectAppealAttachment,
  safeAttachmentName,
  storeAppealAttachment
} from "../../lib/appeal-attachments.js";
import {
  draftAttachmentUsage,
  insertAppealAttachment,
  listDraftAttachments
} from "../../lib/appeal-repository.js";
import { authenticateLinkedAppealRequest } from "../../lib/appeal-session.js";
import { competitionRateLimit, rateLimitHeaders } from "../../lib/competitions/rate-limit.js";
import { json, methodNotAllowed, unauthorized } from "../../lib/responses.js";
import { requireSameOrigin } from "../../lib/security.js";
import { isCanonicalUuid } from "../../lib/validation.js";

async function authorize(context) {
  if (!context.env?.COMPETITIONS_DB || !context.env?.COMPETITIONS_MEDIA) {
    return { response: json({ error: "appeal_attachments_unavailable" }, 503) };
  }
  let session;
  try { session = await authenticateLinkedAppealRequest(context.request, context.env); }
  catch { return { response: json({ error: "appeal_identity_unavailable" }, 503) }; }
  if (!session) return { response: unauthorized() };
  if (!session.linkedMinecraftAccounts.length) return { response: json({ error: "minecraft_link_required" }, 403) };
  return { session };
}

function draftIdFrom(value) {
  const id = String(value ?? "").trim().toLowerCase();
  return isCanonicalUuid(id) ? id : null;
}

async function uploadRateLimit(context, session) {
  const limit = await competitionRateLimit(context.env.COMPETITIONS_DB, {
    scope: "appeal-attachment-upload",
    identity: session.subject,
    limit: 12,
    windowSeconds: 600
  });
  return limit.allowed
    ? null
    : json({ error: "rate_limited", retryAfterSeconds: limit.retryAfterSeconds }, 429, rateLimitHeaders(limit));
}

export async function onRequestGet(context) {
  const authorized = await authorize(context);
  if (authorized.response) return authorized.response;
  const draftId = draftIdFrom(new URL(context.request.url).searchParams.get("draftId"));
  if (!draftId) return json({ error: "invalid_appeal_draft" }, 400);
  try {
    return json({
      attachments: await listDraftAttachments(
        context.env.COMPETITIONS_DB,
        authorized.session.discord.id,
        draftId
      ),
      limits: appealAttachmentLimits()
    });
  } catch {
    return json({ error: "appeal_attachments_unavailable" }, 503);
  }
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const authorized = await authorize(context);
  if (authorized.response) return authorized.response;
  try {
    const limited = await uploadRateLimit(context, authorized.session);
    if (limited) return limited;
  } catch {
    return json({ error: "rate_limit_unavailable" }, 503);
  }

  let form;
  try { form = await context.request.formData(); } catch { return json({ error: "invalid_attachment_form" }, 400); }
  const draftId = draftIdFrom(form.get("draftId"));
  const file = form.get("file");
  if (!draftId || !file || typeof file.arrayBuffer !== "function") {
    return json({ error: "invalid_attachment_form" }, 400);
  }

  const limits = appealAttachmentLimits();
  let usage;
  try {
    usage = await draftAttachmentUsage(
      context.env.COMPETITIONS_DB,
      authorized.session.discord.id,
      draftId
    );
  } catch {
    return json({ error: "appeal_attachments_unavailable" }, 503);
  }
  if (usage.attachmentCount >= limits.maxAttachments) return json({ error: "attachment_limit_reached" }, 409);
  if (Number(file.size) + usage.totalBytes > limits.maxDraftBytes) return json({ error: "attachment_total_too_large" }, 413);

  let data;
  try { data = new Uint8Array(await file.arrayBuffer()); }
  catch { return json({ error: "attachment_read_failed" }, 400); }
  const displayName = safeAttachmentName(file.name);
  const inspection = inspectAppealAttachment(data, file.type, displayName);
  if (!inspection.ok) {
    const status = inspection.error === "attachment_too_large" ? 413 : 415;
    return json({ error: inspection.error }, status);
  }

  const id = crypto.randomUUID();
  let stored;
  try {
    stored = await storeAppealAttachment(context.env.COMPETITIONS_MEDIA, {
      data,
      draftId,
      attachmentId: id,
      inspection
    });
  } catch {
    return json({ error: "attachment_storage_failed" }, 503);
  }

  const now = new Date();
  try {
    const attachment = await insertAppealAttachment(context.env.COMPETITIONS_DB, {
      id,
      draftId,
      ownerDiscordId: authorized.session.discord.id,
      storageKey: stored.key,
      displayName,
      mimeType: stored.mimeType,
      byteSize: stored.byteSize,
      sha256: stored.sha256,
      width: stored.width,
      height: stored.height,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
    });
    return json({ attachment, limits }, 201);
  } catch {
    await deleteAppealAttachment(context.env.COMPETITIONS_MEDIA, stored.key).catch(() => {});
    return json({ error: "attachment_record_failed" }, 503);
  }
}

export function onRequest() { return methodNotAllowed(["GET", "POST"]); }

export { authorize, draftIdFrom, uploadRateLimit };
