const ROOT = "/api/competitions/admin";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function json(path) {
  const response = await fetch(path, { credentials: "same-origin", headers: { accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function waitFor(selector, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const node = document.querySelector(selector);
    if (node) return node;
    await delay(80);
  }
  return null;
}

function statusCard(label, ready, readyText = "Configured", missingText = "Not configured") {
  const card = document.createElement("article");
  card.className = "admin-status-item";
  card.dataset.state = ready ? "ready" : "warning";
  const strong = document.createElement("strong");
  strong.textContent = ready ? readyText : missingText;
  const span = document.createElement("span");
  span.textContent = label;
  card.append(strong, span);
  return card;
}

async function addIntegrationReadiness() {
  const grid = await waitFor("#serviceStatusGrid");
  if (!grid || grid.dataset.integrationReadiness === "true") return;
  try {
    const { payload } = await json(`${ROOT}/status`);
    grid.append(
      statusCard("Discord sign-in", Boolean(payload.identity?.discordOAuthConfigured)),
      statusCard("Minecraft competition bridge", Boolean(payload.bridge?.configured)),
      statusCard("Discord staff review alerts", Boolean(payload.notifications?.discordStaffConfigured)),
      statusCard("Competition site origin", Boolean(payload.siteOrigin?.configured))
    );
    grid.dataset.integrationReadiness = "true";
  } catch {
    // The primary status UI already owns the service-level error message.
  }
}

async function openDeepLinkedReview() {
  const params = new URLSearchParams(window.location.search);
  const competitionId = params.get("competition")?.trim().toLowerCase();
  const submissionId = params.get("submission")?.trim().toLowerCase();
  const section = params.get("section")?.trim().toLowerCase();
  if (!competitionId || section !== "review") return;

  const competitionButton = await waitFor(`#competitionList button[data-competition-id="${CSS.escape(competitionId)}"]`);
  if (!competitionButton) return;
  competitionButton.click();

  const reviewButton = await waitFor('[data-workspace-section="review"]');
  if (!reviewButton) return;
  reviewButton.click();
  if (!submissionId) return;

  let queue;
  try {
    const { response, payload } = await json(`${ROOT}/${encodeURIComponent(competitionId)}/submissions`);
    if (!response.ok) return;
    queue = payload.submissions ?? [];
  } catch {
    return;
  }
  const index = queue.findIndex((submission) => submission.id === submissionId);
  if (index < 0) return;

  const started = Date.now();
  while (Date.now() - started < 8000) {
    const cards = [...document.querySelectorAll(".staff-submission-card")];
    if (cards.length > index) {
      cards[index].click();
      return;
    }
    await delay(80);
  }
}

function init() {
  addIntegrationReadiness();
  openDeepLinkedReview();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
