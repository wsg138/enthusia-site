import { signedStaffRequest } from "./staff-api.js";
import { isCanonicalUuid } from "./validation.js";

function text(value, maximum = 500) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

function candidate(value) {
  const id = String(value?.id ?? "").trim().toLowerCase();
  if (!isCanonicalUuid(id)) return null;
  return Object.freeze({
    id,
    caseId: text(value.caseId, 80),
    type: text(value.type, 40) ?? "Punishment",
    reason: text(value.reason, 500) ?? "No public reason provided",
    createdAt: text(value.createdAt, 64)
  });
}

export async function requestEligiblePunishments(env, minecraftUuid) {
  const upstream = await signedStaffRequest(env, "/v1/website/appeals/eligible", {
    accountId: minecraftUuid
  });
  if (!upstream.ok) return { upstream, punishments: null };
  let payload;
  try { payload = await upstream.json(); } catch { throw new Error("Staff eligibility response is invalid"); }
  if (!Array.isArray(payload?.punishments)) throw new Error("Staff eligibility response is invalid");
  return { upstream: null, punishments: payload.punishments.map(candidate).filter(Boolean) };
}

export { candidate as sanitizeAppealCandidate };
