import {
  appealSubmissionHash,
  sanitizeAppealSubmission,
  staffAppealIdempotencyKey
} from "../lib/appeal-content.js";
import { requestEligiblePunishments } from "../lib/appeal-eligibility.js";
import { finalizeAppealSubmission, prepareAppealSubmission } from "../lib/appeal-repository.js";
import { authenticateLinkedAppealRequest, linkedMinecraftAccount } from "../lib/appeal-session.js";
import { json, methodNotAllowed, serviceUnavailable, unauthorized } from "../lib/responses.js";
import { requireSameOrigin } from "../lib/security.js";
import { signedStaffRequest, staffApiResponse } from "../lib/staff-api.js";
import { isCanonicalUuid } from "../lib/validation.js";

function buildAppealPayload(submission, account, payloadHash) {
  return {
    punishmentId: submission.punishmentId,
    reason: submission.staffReason,
    accountId: account.uuid,
    username: account.name,
    idempotencyKey: staffAppealIdempotencyKey(payloadHash)
  };
}

async function linkedSession(context) {
  if (!context.env?.COMPETITIONS_DB) return { response: serviceUnavailable() };
  let session;
  try { session = await authenticateLinkedAppealRequest(context.request, context.env); }
  catch { return { response: serviceUnavailable() }; }
  if (!session) return { response: unauthorized() };
  if (!session.linkedMinecraftAccounts.length) {
    return { response: json({ error: "minecraft_link_required" }, 403) };
  }
  return { session };
}

async function staffSubmission(context, payload) {
  const upstream = await signedStaffRequest(
    context.env,
    "/v1/website/appeals/submit",
    payload
  );
  if (!upstream.ok) return { response: staffApiResponse(upstream, "private, no-store") };
  let appeal;
  try { appeal = await upstream.json(); } catch { return { response: serviceUnavailable() }; }
  if (!isCanonicalUuid(appeal?.id) || appeal.punishmentId?.toLowerCase() !== payload.punishmentId) {
    return { response: serviceUnavailable() };
  }
  return { appeal };
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const authenticated = await linkedSession(context);
  if (authenticated.response) return authenticated.response;

  let submission;
  try { submission = sanitizeAppealSubmission(await context.request.json()); }
  catch { submission = null; }
  if (!submission) return json({ error: "invalid_appeal" }, 400);
  const account = linkedMinecraftAccount(authenticated.session, submission.minecraftUuid);
  if (!account) return json({ error: "linked_minecraft_account_required" }, 400);

  try {
    const eligible = await requestEligiblePunishments(context.env, account.uuid);
    if (eligible.upstream) return staffApiResponse(eligible.upstream, "private, no-store");
    if (!eligible.punishments.some((candidate) => candidate.id === submission.punishmentId)) {
      return json({ error: "punishment_not_appealable" }, 409);
    }

    const payloadHash = await appealSubmissionHash(authenticated.session, submission);
    const prepared = await prepareAppealSubmission(context.env.COMPETITIONS_DB, {
      session: authenticated.session,
      account,
      submission,
      payloadHash
    });
    if (prepared.status === "CONFLICT") return json({ error: "appeal_draft_conflict" }, 409);
    if (prepared.status === "ATTACHMENT_CONFLICT") return json({ error: "appeal_attachment_conflict" }, 409);

    const payload = buildAppealPayload(submission, account, payloadHash);
    const submitted = await staffSubmission(context, payload);
    if (submitted.response) return submitted.response;
    await finalizeAppealSubmission(context.env.COMPETITIONS_DB, {
      ownerDiscordId: authenticated.session.discord.id,
      draftId: submission.draftId,
      payloadHash,
      appealId: submitted.appeal.id,
      attachmentIds: submission.attachmentIds
    });
    return json(submitted.appeal, 200, { "cache-control": "private, no-store" });
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() { return methodNotAllowed(["POST"]); }

export { buildAppealPayload, linkedSession, staffSubmission };
