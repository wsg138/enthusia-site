import { isCanonicalUuid } from "./validation.js";
import { plainAppealText } from "./appeal-markup.js";

const MAX_STAFF_REASON_LENGTH = 1000;
const MAX_ATTACHMENTS = 5;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export const APPEAL_ANSWER_RULES = Object.freeze({
  whatHappened: Object.freeze({ min: 150, max: 4000 }),
  whyReview: Object.freeze({ min: 120, max: 3000 }),
  ruleUnderstanding: Object.freeze({ min: 100, max: 2500 }),
  futureSteps: Object.freeze({ min: 100, max: 2500 }),
  additionalContext: Object.freeze({ min: 0, max: 3000 })
});

function normalizedText(input, field) {
  return typeof input?.[field] === "string"
    ? input[field].replace(/\r\n?/g, "\n").trim()
    : "";
}

function meaningfulLength(value) {
  return plainAppealText(value).length;
}

export function sanitizeAppealAnswers(input) {
  const answers = {};
  for (const [field, rule] of Object.entries(APPEAL_ANSWER_RULES)) {
    const value = normalizedText(input, field);
    if (CONTROL_CHARACTERS.test(value)) return null;
    const length = meaningfulLength(value);
    if (length < rule.min || value.length > rule.max) return null;
    answers[field] = value;
  }
  return Object.freeze(answers);
}

function clipped(value, maximum) {
  const text = plainAppealText(value);
  if (text.length <= maximum) return text;
  const candidate = text.slice(0, Math.max(1, maximum - 1));
  const boundary = candidate.lastIndexOf(" ");
  return `${(boundary > maximum * 0.65 ? candidate.slice(0, boundary) : candidate).trimEnd()}…`;
}

export function buildStaffReason(answers) {
  const sections = [
    ["What happened", answers.whatHappened, 280],
    ["What should be reviewed", answers.whyReview, 200],
    ["Rule understanding", answers.ruleUnderstanding, 140],
    ["What will change", answers.futureSteps, 180]
  ];
  if (answers.additionalContext) sections.push(["Other context", answers.additionalContext, 90]);
  const reason = sections.map(([label, value, limit]) => `${label}\n${clipped(value, limit)}`).join("\n\n");
  return reason.slice(0, MAX_STAFF_REASON_LENGTH);
}

function canonicalIdList(value) {
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) return null;
  const ids = [...new Set(value.map((entry) => String(entry ?? "").trim().toLowerCase()))];
  return ids.length === value.length && ids.every(isCanonicalUuid) ? Object.freeze(ids) : null;
}

export function sanitizeAppealSubmission(input) {
  const draftId = String(input?.draftId ?? "").trim().toLowerCase();
  const minecraftUuid = String(input?.minecraftUuid ?? "").trim().toLowerCase();
  const punishmentId = String(input?.punishmentId ?? "").trim().toLowerCase();
  if (![draftId, minecraftUuid, punishmentId].every(isCanonicalUuid)) return null;
  const answers = sanitizeAppealAnswers(input);
  const attachmentIds = canonicalIdList(input?.attachmentIds ?? []);
  if (!answers || !attachmentIds) return null;
  return Object.freeze({
    draftId,
    minecraftUuid,
    punishmentId,
    answers,
    attachmentIds,
    staffReason: buildStaffReason(answers)
  });
}

function hex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function appealSubmissionHash(session, submission) {
  const material = JSON.stringify({
    owner: session.discord.id,
    draftId: submission.draftId,
    minecraftUuid: submission.minecraftUuid,
    punishmentId: submission.punishmentId,
    answers: submission.answers,
    attachmentIds: submission.attachmentIds
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return hex(new Uint8Array(digest));
}

export function staffAppealIdempotencyKey(payloadHash) {
  if (!/^[0-9a-f]{64}$/.test(payloadHash)) throw new TypeError("Appeal payload hash is invalid");
  return `appeal-${payloadHash}`;
}

export { MAX_ATTACHMENTS, MAX_STAFF_REASON_LENGTH, plainAppealText };
