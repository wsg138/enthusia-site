import { isWarning, punishmentReason, punishmentStatus, punishmentDuration } from "./punishment-presentation.js?v=1";

export function exactPunishmentCard(item, date) {
  const preview = document.documentElement.hasAttribute("data-preview-root");
  const template = document.querySelector("#exact-punishment-" + (preview ? item.designIndex ?? 0 : 0));
  const node = template.content.firstElementChild.cloneNode(true);
  node.classList.add("punishment-record-card");
  if (preview && item.designIndex !== undefined) return node;
  node.removeAttribute("data-b-class");
  node.querySelector("h2").textContent = item.player || "Unknown player";
  node.querySelector("div>div>p").textContent = isWarning(item) ? "Warning" : item.punishmentType || "Punishment";
  const state = node.querySelector(".tag");
  state.textContent = punishmentStatus(item);
  state.className = "tag " + (!isWarning(item) && item.state === "ACTIVE" ? "tag-red" : "tag-plain");
  node.querySelector(":scope>p").textContent = punishmentReason(item);
  const values = [["Issued", date(item.issuedAt)]];
  if (!isWarning(item)) values.push(["Duration", punishmentDuration(item)]);
  const meta = node.querySelector("dl");
  meta.replaceChildren();
  for (const [label, value] of values) {
    const group = document.createElement("div"), term = document.createElement("dt"), description = document.createElement("dd");
    term.textContent = label; description.textContent = value; group.append(term, description); meta.append(group);
  }
  const link = node.querySelector("a");
  if (!item.appealAvailable) link?.remove();
  else if (link) { link.href = "/appeal.html#new"; link.style.marginTop = "auto"; }
  return node;
}
