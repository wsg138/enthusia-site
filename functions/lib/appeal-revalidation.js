import { signedStaffRequest } from "./staff-api.js";
import { isCanonicalUuid } from "./validation.js";

export function sanitizeRevalidationRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (Object.keys(input).some((key) => key !== "punishmentId")) return null;
  const punishmentId = String(input.punishmentId ?? "").trim().toLowerCase();
  return isCanonicalUuid(punishmentId) ? Object.freeze({ punishmentId }) : null;
}

export function revalidatePunishment(env, accountId, binding) {
  return signedStaffRequest(env, "/v1/website/punishment-codes/revalidate", {
    accountId,
    punishmentId: binding.punishmentId,
    codeGeneration: binding.codeGeneration
  });
}
