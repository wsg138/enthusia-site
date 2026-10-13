export function isWarning(item) {
  return ["WARN", "WARNING"].includes(String(item.punishmentType || item.type || "").toUpperCase());
}

export function punishmentReason(item) {
  const reason = String(item.publicReason ?? item.reason ?? "").trim();
  const missing = !reason || ["Imported legacy punishment", "No public reason provided"].includes(reason);
  if (!missing) return reason;
  if (isWarning(item)) return "Reason not recorded in the previous system.";
  return String(item.broadReason || "No public reason is available.");
}

export function punishmentStatus(item) {
  if (isWarning(item)) return ["REVOKED", "OVERTURNED"].includes(item.state) ? "Removed" : "Recorded";
  return { ACTIVE: "Active", EXPIRED: "Expired", REVOKED: "Removed", OVERTURNED: "Overturned" }[item.state] || "Unavailable";
}

export function punishmentDuration(item) {
  if (isWarning(item)) return null;
  if (!item.expiresAt) return "Permanent";
  const seconds = Math.round((Date.parse(item.expiresAt) - Date.parse(item.issuedAt)) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return "Unavailable";
  if (seconds === 0) return "Immediate";
  let remaining = seconds;
  const parts = [];
  for (const [size, label] of [[86400, "day"], [3600, "hour"], [60, "minute"], [1, "second"]]) {
    const count = Math.floor(remaining / size);
    if (count) { parts.push(`${count} ${label}${count === 1 ? "" : "s"}`); remaining %= size; }
    if (parts.length === 2) break;
  }
  return parts.join(" ");
}

export function publicPunishmentLink(item) {
  return `/punishments.html?${new URLSearchParams({ q: item.caseId || item.minecraftName || item.player || "" })}`;
}
