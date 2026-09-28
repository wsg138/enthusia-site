import {
  findPunishmentBinding,
  sanitizePunishmentBinding,
  saveRevalidatedPunishmentBinding
} from "./appeal-bindings.js";
import { revalidatePunishment } from "./appeal-revalidation.js";

const defaults = Object.freeze({
  findBinding: findPunishmentBinding,
  requestStaff: revalidatePunishment,
  saveBinding: saveRevalidatedPunishmentBinding
});

export async function revalidateOwnedPunishmentBinding(input, dependencies = defaults) {
  const current = await dependencies.findBinding(
    input.db,
    input.ownerDiscordId,
    input.punishmentId
  );
  if (!current) return Object.freeze({ kind: "NOT_FOUND" });

  const upstream = await dependencies.requestStaff(input.env, input.accountId, current);
  if (!upstream.ok) return Object.freeze({ kind: "UPSTREAM_REJECTED", upstream });

  let raw;
  try { raw = await upstream.json(); } catch { return Object.freeze({ kind: "INVALID_UPSTREAM" }); }
  const binding = sanitizePunishmentBinding(raw);
  if (!binding || binding.punishmentId !== current.punishmentId) {
    return Object.freeze({ kind: "INVALID_UPSTREAM" });
  }

  const saved = await dependencies.saveBinding(
    input.db,
    input.ownerDiscordId,
    binding
  );
  return Object.freeze({ kind: "OK", binding: saved });
}
