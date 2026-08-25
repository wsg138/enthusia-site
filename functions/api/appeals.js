import { authenticateAppealRequest } from "../lib/appeal-session.js";
import { claimPunishment, sanitizeClaim } from "../lib/appeal-claim.js";
import { json, methodNotAllowed, serviceUnavailable, unauthorized } from "../lib/responses.js";
import { appealIdempotencyKey, requireSameOrigin } from "../lib/security.js";
import { signedStaffRequest, staffApiResponse } from "../lib/staff-api.js";
import { isCanonicalUuid } from "../lib/validation.js";

const MAX_REASON_LENGTH = 1000;

const ANSWER_RULES = Object.freeze({
  whatHappened: Object.freeze({ min: 100, max: 260 }),
  whyReview: Object.freeze({ min: 100, max: 260 }),
  futureSteps: Object.freeze({ min: 75, max: 180 }),
  additionalContext: Object.freeze({ min: 0, max: 100 })
});

function answerText(input, field) {
  return typeof input?.[field] === "string" ? input[field].replace(/\r\n?/g, "\n").trim() : "";
}

function meaningfulLength(value) {
  return value.replace(/\s+/g, " ").length;
}

function sanitizeAnswers(input) {
  const answers = {};
  for (const [field, rule] of Object.entries(ANSWER_RULES)) {
    const value = answerText(input, field);
    const length = meaningfulLength(value);
    if (length < rule.min || value.length > rule.max) return null;
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) return null;
    answers[field] = value;
  }
  return Object.freeze(answers);
}

function buildReason(answers) {
  const sections = [
    `What happened?\n${answers.whatHappened}`,
    `Why should the punishment be reconsidered?\n${answers.whyReview}`,
    `What will you do differently?\n${answers.futureSteps}`
  ];
  if (answers.additionalContext) sections.push(`Additional context\n${answers.additionalContext}`);
  return sections.join("\n\n");
}

function sanitizeSubmission(input) {
  const claim = sanitizeClaim(input);
  if (!claim) return null;
  const answers = sanitizeAnswers(input);
  if (!answers) return null;
  const reason = buildReason(answers);
  if (reason.length > MAX_REASON_LENGTH) return null;
  return { ...claim, answers, reason };
}

function verifiedBinding(input, claim) {
  const punishmentId = typeof input?.punishmentId === "string" ? input.punishmentId.trim() : "";
  const username = typeof input?.boundUsername === "string" ? input.boundUsername.trim() : "";
  if (!isCanonicalUuid(punishmentId) || username.toLowerCase() !== claim.username.toLowerCase()) return null;
  return { punishmentId, username };
}

function buildAppealPayload(submission, session, binding) {
  return {
    punishmentId: binding.punishmentId,
    reason: submission.reason,
    accountId: session.accountId,
    username: binding.username
  };
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  let session;
  try { session = await authenticateAppealRequest(context.request, context.env); } catch { return unauthorized(); }

  let submission;
  try { submission = sanitizeSubmission(await context.request.json()); } catch { submission = null; }
  if (!submission) return json({ error: "invalid_appeal" }, 400);

  try {
    const claimResponse = await claimPunishment(context.env, session, submission);
    if (!claimResponse.ok) return staffApiResponse(claimResponse, "private, no-store");
    const binding = verifiedBinding(await claimResponse.json(), submission);
    if (!binding) return serviceUnavailable();
    const payload = buildAppealPayload(submission, session, binding);
    payload.idempotencyKey = await appealIdempotencyKey(session, {
      punishmentId: binding.punishmentId,
      reason: submission.reason
    });
    return staffApiResponse(
      await signedStaffRequest(context.env, "/v1/website/appeals/submit", payload),
      "private, no-store"
    );
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() { return methodNotAllowed(["POST"]); }
export { buildAppealPayload, buildReason, sanitizeAnswers, sanitizeSubmission, verifiedBinding };
