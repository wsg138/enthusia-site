import { signedStaffRequest } from "./staff-api.js";

export function sanitizeClaim(input) {
  const punishmentCode = typeof input?.punishmentCode === "string"
    ? input.punishmentCode.replace(/[-\s]+/g, "").toUpperCase()
    : "";
  const username = typeof input?.username === "string" ? input.username.trim() : "";
  if (!/^[A-HJ-NP-Z2-9]{24}$/.test(punishmentCode)) return null;
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) return null;
  return { punishmentCode, username };
}

export async function claimPunishment(env, session, claim) {
  return signedStaffRequest(env, "/v1/website/punishment-codes/claim", {
    accountId: session.accountId,
    username: claim.username,
    punishmentCode: claim.punishmentCode
  });
}
