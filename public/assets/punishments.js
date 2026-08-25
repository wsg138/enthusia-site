const resultsRoot = document.querySelector("#punishment-results");
const summary = document.querySelector("#punishment-summary");
const form = document.querySelector("#punishment-search");
const query = document.querySelector("#punishment-query");
const clearSearch = document.querySelector("#punishment-clear-search");
const loadMore = document.querySelector("#punishment-load-more");
const filters = [...document.querySelectorAll("[data-punishment-filter]")];
let activeFilter = "ALL";
let activeSearch = "";
let nextCursor = null;

function date(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(parsed) : "Unavailable";
}

function duration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  if (!value) return "Ended";
  const units = [[86400, "day"], [3600, "hour"], [60, "minute"]];
  for (const [size, label] of units) {
    if (value >= size) {
      const amount = Math.ceil(value / size);
      return `${amount} ${label}${amount === 1 ? "" : "s"} remaining`;
    }
  }
  return "Less than a minute remaining";
}

function punishmentCard(item) {
  const article = document.createElement("article");
  article.className = "punishment-card card";
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
  state.textContent = item.state || "Unknown";
  top.append(identity, state);
  const reason = document.createElement("p");
  reason.className = "punishment-reason";
  reason.textContent = item.publicReason || item.broadReason || "No public reason is available.";
  const meta = document.createElement("dl");
  meta.className = "punishment-meta";
  const values = [
    ["Issued", date(item.issuedAt)],
    ["Duration", item.expiresAt ? `${date(item.expiresAt)} · ${duration(item.remainingSeconds)}` : "Permanent"],
    ["Case", item.caseId || "Unavailable"]
  ];
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
  if (item.appealAvailable) {
    const link = document.createElement("a");
    link.className = "text-button punishment-appeal-link";
    link.href = "/appeal.html";
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
    resultsRoot.replaceChildren();
    summary.textContent = activeSearch ? `Searching for “${activeSearch}”…` : "Loading public records…";
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
    resultsRoot.append(...items.map(punishmentCard));
    nextCursor = activeSearch ? null : payload.nextCursor || null;
    loadMore.hidden = !nextCursor;
    const total = resultsRoot.childElementCount;
    summary.textContent = total
      ? `${total} public record${total === 1 ? "" : "s"}${activeSearch ? ` matching “${activeSearch}”` : " shown"}.`
      : activeSearch ? `No public records match “${activeSearch}”.` : "No public records are available for this filter.";
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

load();
