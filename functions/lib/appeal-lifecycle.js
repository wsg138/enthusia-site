import { buildStaffReason, sanitizeAppealAnswers } from "./appeal-content.js";
import { boundedIdempotencyKey } from "./security.js";
import { isCanonicalUuid } from "./validation.js";

const APPEAL_STATUSES = new Set([
  "OPEN",
  "INFORMATION_REQUESTED",
  "APPROVAL_PENDING",
  "APPLIED",
  "DENIED",
  "REJECTED"
]);
const EDIT_FIELDS = new Set(["expectedVersion", "idempotencyKey", "answers"]);
const CLAIM_FIELDS = new Set(["expectedVersion", "idempotencyKey"]);
const REOPEN_FIELDS = new Set(["expectedVersion", "idempotencyKey", "note"]);

function version(value) {
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

function allowedFields(input, allowed) {
  return input && typeof input === "object" && !Array.isArray(input)
    && Object.keys(input).every((field) => allowed.has(field));
}

export function sanitizeAppealEdit(input) {
  if (!allowedFields(input, EDIT_FIELDS)) return null;
  const expectedVersion = version(input.expectedVersion);
  const idempotencyKey = boundedIdempotencyKey(input.idempotencyKey);
  const answers = sanitizeAppealAnswers(input.answers);
  if (!expectedVersion || !idempotencyKey || !answers) return null;
  return Object.freeze({
    expectedVersion,
    idempotencyKey,
    answers,
    staffReason: buildStaffReason(answers)
  });
}

export function sanitizeReviewerClaim(input) {
  if (!allowedFields(input, CLAIM_FIELDS)) return null;
  const expectedVersion = version(input.expectedVersion);
  const idempotencyKey = boundedIdempotencyKey(input.idempotencyKey);
  return expectedVersion && idempotencyKey
    ? Object.freeze({ expectedVersion, idempotencyKey })
    : null;
}

export function sanitizeReviewerReopen(input) {
  if (!allowedFields(input, REOPEN_FIELDS)) return null;
  const expectedVersion = version(input.expectedVersion);
  const idempotencyKey = boundedIdempotencyKey(input.idempotencyKey);
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (!expectedVersion || !idempotencyKey || note.length < 3 || note.length > 1000) return null;
  return Object.freeze({ expectedVersion, idempotencyKey, note });
}

export function projectAppealMutation(payload, appealId) {
  if (!payload || !isCanonicalUuid(payload.id) || payload.id.toLowerCase() !== appealId) return null;
  if (!isCanonicalUuid(payload.punishmentId) || !APPEAL_STATUSES.has(payload.status)) return null;
  const normalizedVersion = version(payload.version);
  if (!normalizedVersion || typeof payload.claimed !== "boolean") return null;
  return Object.freeze({
    id: payload.id.toLowerCase(),
    punishmentId: payload.punishmentId.toLowerCase(),
    caseId: typeof payload.caseId === "string" ? payload.caseId.slice(0, 32) : null,
    punishmentType: typeof payload.punishmentType === "string" ? payload.punishmentType.slice(0, 64) : null,
    player: typeof payload.player === "string" ? payload.player.slice(0, 64) : null,
    reason: typeof payload.reason === "string" ? payload.reason.slice(0, 1000) : "",
    status: payload.status,
    version: normalizedVersion,
    decision: typeof payload.decision === "string" ? payload.decision.slice(0, 32) : null,
    decisionNote: typeof payload.decisionNote === "string" ? payload.decisionNote.slice(0, 1000) : null,
    createdAt: typeof payload.createdAt === "string" ? payload.createdAt : null,
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : null,
    replayed: payload.replayed === true,
    claimed: payload.claimed
  });
}
