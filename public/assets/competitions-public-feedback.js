const API_ROOT = "/api/competitions";

function slugFromLocation() {
  return new URLSearchParams(window.location.search).get("competition")?.trim().toLowerCase() ?? "";
}

function installStyles() {
  if (document.querySelector("style[data-competition-public-feedback]")) return;
  const style = document.createElement("style");
  style.dataset.competitionPublicFeedback = "true";
  style.textContent = `
    .competition-public-feedback {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid rgb(255 255 255 / .1);
      display: grid;
      gap: 8px;
    }
    .competition-public-feedback strong {
      font-size: .82rem;
      letter-spacing: .04em;
      text-transform: uppercase;
      opacity: .72;
    }
    .competition-public-feedback blockquote {
      margin: 0;
      padding: 9px 11px;
      border-radius: 9px;
      background: rgb(255 255 255 / .055);
      white-space: pre-wrap;
    }
  `;
  document.head.append(style);
}

function feedbackValues(result) {
  return Array.isArray(result?.publicJudgeFeedback)
    ? result.publicJudgeFeedback.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim())
    : [];
}

function enhanceResults(payload) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  if (!results.length) return true;
  const byPlacement = new Map(results.map((result) => [String(result.placement), result]));
  const cards = [...document.querySelectorAll('[data-tab-panel="results"] [data-placement]')];
  if (!cards.length) return false;

  for (const card of cards) {
    if (card.querySelector(".competition-public-feedback")) continue;
    const result = byPlacement.get(String(card.dataset.placement));
    const feedback = feedbackValues(result);
    if (!feedback.length) continue;
    const section = document.createElement("section");
    section.className = "competition-public-feedback";
    const label = document.createElement("strong");
    label.textContent = feedback.length === 1 ? "Judge feedback" : "Judge feedback";
    section.append(label);
    for (const value of feedback) {
      const quote = document.createElement("blockquote");
      quote.textContent = value;
      section.append(quote);
    }
    card.append(section);
  }
  return true;
}

async function init() {
  if (document.body.dataset.competitionPage !== "detail") return;
  const slug = slugFromLocation();
  if (!slug) return;
  const response = await fetch(`${API_ROOT}/${encodeURIComponent(slug)}`, {
    credentials: "same-origin",
    headers: { accept: "application/json" }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) return;
  if (!Array.isArray(payload.results) || !payload.results.length) return;
  installStyles();
  const started = Date.now();
  while (Date.now() - started < 8000) {
    if (enhanceResults(payload)) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();

export { enhanceResults, feedbackValues };
