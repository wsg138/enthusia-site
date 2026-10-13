import { loadOwnedPunishmentAppeals, ownedPunishmentAppealLink } from "./punishment-appeal-links.js?v=1";
import { exactPunishmentCard } from './exact-punishments.js?v=3';
import { isWarning, punishmentReason, punishmentStatus, punishmentDuration } from './punishment-presentation.js?v=1';
const resultsRoot = document.querySelector("#punishment-results");
const summary = document.querySelector("#punishment-summary");
const form = document.querySelector("#punishment-search");
const query = document.querySelector("#punishment-query");
const clearSearch = document.querySelector("#punishment-clear-search");
const loadMore = document.querySelector("#punishment-load-more");
const filters = [...document.querySelectorAll("[data-punishment-filter]")];
let activeFilter = "ALL";
const initialQuery = new URLSearchParams(window.location.search).get("q")?.trim() || "";
let activeSearch = initialQuery.length <= 80 ? initialQuery : "";
const selectedRecord = value => /^[0-9A-HJKMNP-TV-Z]{16}$/i.test(value);
query.value = selectedRecord(activeSearch) ? "" : activeSearch;
clearSearch.hidden = !activeSearch;
let nextCursor = null;
let ownedPunishments = [];
let displayedItems = [];

function date(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(parsed) : "Unavailable";
}

function punishmentCard(item) {
  const appealHref = ownedPunishmentAppealLink(item, ownedPunishments);
  if(document.body.hasAttribute("data-exact-punishments"))return exactPunishmentCard(item,date,appealHref);
  const article = document.createElement("article");
  article.className = "punishment-card card punishment-record-card";
  const top = document.createElement("div");
  top.className = "punishment-card-top";
  const identity = document.createElement("div");
  const kicker = document.createElement("p");
  kicker.className = "card-kicker";
  kicker.textContent = item.punishmentType || "Punishment";
  const heading = document.createElement("h2");
  heading.textContent = item.player || "Unknown player";
  identity.append(kicker, heading);
  const state = document.createElement("span");
  state.className = `punishment-state punishment-state-${String(item.state || "unknown").toLowerCase()}`;
  state.textContent = punishmentStatus(item);
  top.append(identity, state);
  const reason = document.createElement("p");
  reason.className = "punishment-reason";
  reason.textContent = punishmentReason(item);
  const meta = document.createElement("dl");
  meta.className = "punishment-meta";
  const values = [["Issued", date(item.issuedAt)]];
  if (!isWarning(item)) values.push(["Duration", punishmentDuration(item)]);
  for (const [label, value] of values) {
    const group = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    group.append(term, description);
    meta.append(group);
  }
  article.append(top, reason, meta);
  if (appealHref) {
    const link = document.createElement("a");
    link.className = "text-button punishment-appeal-link";
    link.href = appealHref;
    link.textContent = "Appeal this punishment";
    article.append(link);
  }
  return article;
}

function setLoading(loading) {
  resultsRoot.setAttribute("aria-busy", String(loading));
  loadMore.disabled = loading;
}

async function load({ append = false } = {}) {
  setLoading(true);
  if (!append) {
    displayedItems = [];
    resultsRoot.replaceChildren();
    summary.textContent = activeSearch ? (selectedRecord(activeSearch) ? "Loading selected public records…" : `Searching for “${activeSearch}”…`) : "Loading public records…";
  }
  const parameters = new URLSearchParams();
  if (activeSearch) parameters.set("q", activeSearch);
  else {
    parameters.set("type", activeFilter);
    if (append && nextCursor) parameters.set("cursor", nextCursor);
  }
  try {
    const response = await fetch(`/api/punishments?${parameters}`, { headers: { accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(response.status));
    const items = Array.isArray(payload) ? payload : Array.isArray(payload.items) ? payload.items : [];
    if (!append) resultsRoot.replaceChildren();
    displayedItems = append ? [...displayedItems, ...items] : items;
    resultsRoot.append(...items.map(punishmentCard));
    nextCursor = activeSearch ? null : payload.nextCursor || null;
    loadMore.hidden = !nextCursor;
    const total = resultsRoot.childElementCount;
    summary.textContent = total
      ? `${total} public record${total === 1 ? "" : "s"}${activeSearch ? (selectedRecord(activeSearch) ? " for the selected record" : ` matching “${activeSearch}”`) : " shown"}.`
      : activeSearch ? (selectedRecord(activeSearch) ? "This punishment is not part of the public record. You can still manage its appeal from your account." : `No public records match “${activeSearch}”.`) : "No public records are available for this filter.";
  } catch {
    if (!append) resultsRoot.replaceChildren();
    summary.textContent = "Public punishment history is temporarily unavailable.";
    loadMore.hidden = true;
  } finally {
    setLoading(false);
  }
}

filters.forEach((button) => button.addEventListener("click", () => {
  activeFilter = button.dataset.punishmentFilter;
  activeSearch = "";
  query.value = "";
  clearSearch.hidden = true;
  filters.forEach((candidate) => {
    const active = candidate === button;
    candidate.classList.toggle("active", active);
    candidate.setAttribute("aria-pressed", String(active));
  });
  load();
}));
form.addEventListener("submit", (event) => {
  event.preventDefault();
  activeSearch = query.value.trim();
  clearSearch.hidden = !activeSearch;
  load();
});
clearSearch.addEventListener("click", () => {
  activeSearch = "";
  query.value = "";
  clearSearch.hidden = true;
  load();
});
loadMore.addEventListener("click", () => load({ append: true }));

void loadOwnedPunishmentAppeals().then(owned => {
  ownedPunishments = owned;
  resultsRoot.replaceChildren(...displayedItems.map(punishmentCard));
});
load();
