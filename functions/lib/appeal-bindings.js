import { canonicalCaseId } from "./public-punishment.js";
import { isCanonicalUuid } from "./validation.js";

const TOKEN = /^[A-Z0-9_:-]{1,64}$/;
const USERNAME = /^[A-Za-z0-9_]{3,16}$/;
const OWNER = /^(?:discord:\d{16,22}|email:[0-9a-f-]{36})$/;

function database(db) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("Appeal database is unavailable");
  return db;
}

function ownerIdentity(value) {
  const owner = String(value ?? "").trim().toLowerCase();
  if (!OWNER.test(owner)) throw new TypeError("Appeal binding owner is invalid");
  if (owner.startsWith("email:") && !isCanonicalUuid(owner.slice(6))) {
    throw new TypeError("Appeal binding owner is invalid");
  }
  return owner;
}

function rows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 ? number : null;
}

export function sanitizePunishmentBinding(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const punishmentId = String(value.punishmentId ?? "").trim().toLowerCase();
  const caseId = canonicalCaseId(value.caseId);
  const codeGeneration = positiveInteger(value.codeGeneration);
  const punishmentType = String(value.punishmentType ?? "").trim().toUpperCase();
  const boundUsername = String(value.boundUsername ?? "").trim();
  const eligibilityState = String(value.eligibilityState ?? "").trim().toUpperCase();
  if (!isCanonicalUuid(punishmentId)
      || !caseId
      || !codeGeneration
      || !TOKEN.test(punishmentType)
      || !USERNAME.test(boundUsername)
      || typeof value.eligible !== "boolean"
      || !TOKEN.test(eligibilityState)) {
    return null;
  }
  return Object.freeze({
    punishmentId,
    caseId,
    codeGeneration,
    punishmentType,
    boundUsername,
    eligible: value.eligible,
    eligibilityState
  });
}

function bindingFromRow(row) {
  return Object.freeze({
    punishmentId: row.punishmentId,
    caseId: row.caseId,
    codeGeneration: Number(row.codeGeneration),
    punishmentType: row.punishmentType,
    boundUsername: row.boundUsername,
    eligible: Number(row.eligible) === 1,
    eligibilityState: row.eligibilityState,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastValidatedAt: row.lastValidatedAt
  });
}

export async function saveClaimedPunishmentBinding(db, owner, binding, now = new Date()) {
  const store = database(db);
  const identity = ownerIdentity(owner);
  const value = sanitizePunishmentBinding(binding);
  if (!value) throw new TypeError("Staff punishment binding is invalid");
  const timestamp = now.toISOString();
  await store.prepare(`
    INSERT INTO appeal_punishment_bindings (
      punishment_id, owner_identity, case_id, code_generation, punishment_type,
      bound_username, eligible, eligibility_state, created_at, updated_at, last_validated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(punishment_id) DO UPDATE SET
      owner_identity = excluded.owner_identity,
      case_id = excluded.case_id,
      code_generation = excluded.code_generation,
      punishment_type = excluded.punishment_type,
      bound_username = excluded.bound_username,
      eligible = excluded.eligible,
      eligibility_state = excluded.eligibility_state,
      updated_at = excluded.updated_at,
      last_validated_at = excluded.last_validated_at
  `).bind(
    value.punishmentId,
    identity,
    value.caseId,
    value.codeGeneration,
    value.punishmentType,
    value.boundUsername,
    value.eligible ? 1 : 0,
    value.eligibilityState,
    timestamp,
    timestamp,
    timestamp
  ).run();
  return value;
}

export async function listPunishmentBindings(db, owner) {
  const result = await database(db).prepare(`
    SELECT punishment_id AS punishmentId, case_id AS caseId,
           code_generation AS codeGeneration, punishment_type AS punishmentType,
           bound_username AS boundUsername, eligible, eligibility_state AS eligibilityState,
           created_at AS createdAt, updated_at AS updatedAt, last_validated_at AS lastValidatedAt
    FROM appeal_punishment_bindings
    WHERE owner_identity = ?
    ORDER BY updated_at DESC, punishment_id ASC
  `).bind(ownerIdentity(owner)).all();
  return rows(result).map(bindingFromRow);
}

export async function findPunishmentBinding(db, owner, punishmentId) {
  if (!isCanonicalUuid(punishmentId)) return null;
  const row = await database(db).prepare(`
    SELECT punishment_id AS punishmentId, case_id AS caseId,
           code_generation AS codeGeneration, punishment_type AS punishmentType,
           bound_username AS boundUsername, eligible, eligibility_state AS eligibilityState,
           created_at AS createdAt, updated_at AS updatedAt, last_validated_at AS lastValidatedAt
    FROM appeal_punishment_bindings
    WHERE owner_identity = ? AND punishment_id = ?
    LIMIT 1
  `).bind(ownerIdentity(owner), punishmentId).first();
  return row ? bindingFromRow(row) : null;
}

export async function saveRevalidatedPunishmentBinding(db, owner, binding, now = new Date()) {
  const store = database(db);
  const identity = ownerIdentity(owner);
  const value = sanitizePunishmentBinding(binding);
  if (!value) throw new TypeError("Staff punishment binding is invalid");
  const timestamp = now.toISOString();
  const preserveClaimGeneration = value.eligibilityState === "CODE_ROTATED";
  const result = await store.prepare(`
    UPDATE appeal_punishment_bindings
    SET case_id = ?,
        code_generation = CASE WHEN ? THEN code_generation ELSE ? END,
        punishment_type = ?, bound_username = ?, eligible = ?, eligibility_state = ?,
        updated_at = ?, last_validated_at = ?
    WHERE owner_identity = ? AND punishment_id = ?
  `).bind(
    value.caseId,
    preserveClaimGeneration ? 1 : 0,
    value.codeGeneration,
    value.punishmentType,
    value.boundUsername,
    value.eligible ? 1 : 0,
    value.eligibilityState,
    timestamp,
    timestamp,
    identity,
    value.punishmentId
  ).run();
  if (Number(result?.meta?.changes ?? 0) !== 1) throw new Error("Punishment binding was not updated");
  return findPunishmentBinding(store, identity, value.punishmentId);
}
