const root = document.querySelector("#appeals");
const statusFilter = document.querySelector("#status");
const refreshButton = document.querySelector("#refresh");
let refreshTimer = null;
let loading = false;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function cardCaseId(card) {
  const value = card.querySelector(".card-kicker")?.textContent?.trim() ?? "";
  return value.startsWith("Case ") ? value.slice(5).trim() : "";
}

function setDisabled(container, disabled) {
  for (const control of container.querySelectorAll("button, textarea")) control.disabled = disabled;
}

async function postLifecycle(appeal, action, body, container, status) {
  setDisabled(container, true);
  status.textContent = action === "claim" ? "Claiming appeal…" : "Reopening appeal…";
  try {
    const response = await fetch(`/api/reviewer/appeals/${encodeURIComponent(appeal.id)}/${action}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body)
    });
    if (response.status === 409) {
      status.textContent = "This appeal changed while you were reviewing it. Refresh and try again.";
      return;
    }
    if (!response.ok) {
      status.textContent = `The appeal could not be ${action === "claim" ? "claimed" : "reopened"} (${response.status}).`;
      return;
    }
    status.textContent = action === "claim" ? "Appeal claimed." : "Appeal reopened.";
    refreshButton?.click();
  } catch {
    status.textContent = "The appeal service is not responding. Try again.";
  } finally {
    setDisabled(container, false);
  }
}

function claimControls(appeal) {
  const section = element("section", "reviewer-lifecycle");
  section.dataset.reviewLifecycle = "claim";
  section.append(element("h3", "", "Claim appeal"));
  section.append(element("p", "", "Claiming locks the player's submitted appeal so staff can review a stable version."));
  const button = element("button", "btn ghost", "Claim appeal");
  button.type = "button";
  const status = element("p", "reviewer-action-status");
  status.setAttribute("role", "status");
  button.addEventListener("click", () => postLifecycle(
    appeal,
    "claim",
    { expectedVersion: Number(appeal.version), idempotencyKey: crypto.randomUUID() },
    section,
    status
  ));
  section.append(button, status);
  return section;
}

function claimedNotice() {
  const section = element("section", "reviewer-lifecycle reviewer-lifecycle-claimed");
  section.dataset.reviewLifecycle = "claimed";
  section.append(element("strong", "", "Claimed for review"));
  section.append(element("p", "", "The player's submitted appeal is read-only. You can now record the outcome."));
  return section;
}

function unavailableNotice() {
  const section = element("section", "reviewer-lifecycle reviewer-details-warning");
  section.dataset.reviewLifecycle = "unavailable";
  section.append(element("strong", "", "Claim state unavailable"));
  section.append(element("p", "", "Refresh before deciding this appeal. Decisions stay disabled until claim state can be verified."));
  return section;
}

function reopenControls(appeal) {
  const section = element("section", "reviewer-lifecycle");
  section.dataset.reviewLifecycle = "reopen";
  section.append(element("h3", "", "Reopen appeal"));
  const label = element("label", "reviewer-note");
  label.append(element("span", "", "Why is this being reopened?"));
  const note = document.createElement("textarea");
  note.minLength = 3;
  note.maxLength = 1000;
  note.rows = 3;
  note.required = true;
  label.append(note);
  const button = element("button", "btn ghost", "Reopen appeal");
  button.type = "button";
  const status = element("p", "reviewer-action-status");
  status.setAttribute("role", "status");
  button.addEventListener("click", () => {
    const value = note.value.trim();
    if (value.length < 3) {
      status.textContent = "Add a short reason before reopening.";
      note.focus();
      return;
    }
    postLifecycle(
      appeal,
      "reopen",
      {
        expectedVersion: Number(appeal.version),
        note: value,
        idempotencyKey: crypto.randomUUID()
      },
      section,
      status
    );
  });
  section.append(label, button, status);
  return section;
}

function decorateCard(card, appeal, canReopen) {
  const signature = `${appeal.version}:${appeal.status}:${appeal.claimed}:${canReopen}`;
  if (card.dataset.lifecycleSignature === signature) return;
  card.dataset.lifecycleSignature = signature;
  card.querySelectorAll("[data-review-lifecycle]").forEach((node) => node.remove());
  const content = card.querySelector(".reviewer-card-content");
  if (!content) return;
  const decision = content.querySelector(".reviewer-decision");

  if (["OPEN", "INFORMATION_REQUESTED"].includes(appeal.status)) {
    if (appeal.claimed === true) {
      content.insertBefore(claimedNotice(), decision ?? null);
      if (decision) decision.hidden = false;
    } else if (appeal.claimed === false) {
      content.insertBefore(claimControls(appeal), decision ?? null);
      if (decision) decision.hidden = true;
    } else {
      content.insertBefore(unavailableNotice(), decision ?? null);
      if (decision) decision.hidden = true;
    }
  }

  if (canReopen && ["DENIED", "REJECTED"].includes(appeal.status)) {
    content.append(reopenControls(appeal));
  }
}

function applyPayload(payload) {
  const appeals = Array.isArray(payload?.appeals) ? payload.appeals : [];
  const byCase = new Map(appeals.map((appeal) => [String(appeal.caseId), appeal]));
  for (const card of root?.querySelectorAll(".reviewer-appeal-card") ?? []) {
    const appeal = byCase.get(cardCaseId(card));
    if (appeal) decorateCard(card, appeal, payload.canReopen === true);
  }
}

async function refreshLifecycle() {
  if (!root || loading) return;
  loading = true;
  try {
    const status = statusFilter?.value || "OPEN";
    const response = await fetch(`/api/reviewer/appeals?status=${encodeURIComponent(status)}`, {
      credentials: "same-origin",
      headers: { accept: "application/json" }
    });
    if (!response.ok) return;
    applyPayload(await response.json());
  } catch {
    // The primary reviewer UI owns its normal error state.
  } finally {
    loading = false;
  }
}

function scheduleRefresh() {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(refreshLifecycle, 80);
}

if (root) {
  new MutationObserver(scheduleRefresh).observe(root, { childList: true, subtree: true });
  statusFilter?.addEventListener("change", scheduleRefresh);
  refreshButton?.addEventListener("click", scheduleRefresh);
  scheduleRefresh();
}
