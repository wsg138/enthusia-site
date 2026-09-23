const ROOT = "/api/competitions/admin";

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function selectedCompetitionId() {
  return document.querySelector("#competitionList button.is-active[data-competition-id]")?.dataset.competitionId ?? null;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `HTTP_${response.status}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

function errorText(error) {
  return String(error?.payload?.error ?? error?.message ?? "flag_update_failed").replaceAll("_", " ");
}

function createPanel() {
  const nav = document.querySelector(".competition-editor-nav");
  const content = document.querySelector(".competition-editor-content");
  if (!nav || !content || document.querySelector('[data-admin-flags="true"]')) return;

  const button = el("button", "", "Flags");
  button.type = "button";
  button.dataset.adminFlags = "true";
  nav.append(button);

  const panel = el("section", "editor-section admin-workspace-panel");
  panel.dataset.adminFlagsPanel = "flags";
  panel.hidden = true;
  const heading = el("div", "editor-section-heading");
  const copy = el("div");
  copy.append(
    el("p", "admin-eyebrow", "Investigation"),
    el("h3", "", "Private submission flags"),
    el("p", "admin-muted", "Flags are staff-only investigation markers. They do not reject, hide, or disqualify an entry by themselves.")
  );
  heading.append(copy);
  const body = el("div", "admin-workspace-body");
  panel.append(heading, body);
  content.append(panel);

  button.addEventListener("click", async () => {
    nav.querySelectorAll("button").forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
    content.querySelectorAll("[data-editor-panel], [data-workspace-panel], [data-admin-tools-panel], [data-admin-flags-panel]").forEach((candidate) => {
      candidate.hidden = candidate !== panel;
      candidate.classList.toggle("is-active", candidate === panel);
    });
    await loadFlags(body);
  });
}

async function updateFlag(competitionId, submission, flagged) {
  const privateNote = flagged
    ? window.prompt(`Private investigation reason for “${submission.title}”:`)?.trim()
    : window.prompt("Optional private note for clearing this flag:", "")?.trim() || null;
  if (flagged && !privateNote) return false;
  await api(`${ROOT}/${encodeURIComponent(competitionId)}/submissions/${encodeURIComponent(submission.id)}`, {
    method: "POST",
    body: JSON.stringify({ action: flagged ? "FLAG" : "CLEAR_FLAG", privateNote })
  });
  return true;
}

function submissionRow(competitionId, submission, body) {
  const row = el("article", "staff-submission-card");
  row.type = "button";
  const top = el("div", "staff-submission-card-top");
  top.append(
    el("strong", "", submission.title),
    el("span", "competition-badge", submission.flagged ? "Flagged" : submission.status.replaceAll("_", " "))
  );
  row.append(
    top,
    el("span", "admin-muted", `${submission.ownerName} · ${submission.entryType}`)
  );
  if (submission.flagReason) row.append(el("p", "staff-submission-reason", submission.flagReason));
  const actions = el("div", "admin-workspace-toolbar");
  const toggle = el("button", submission.flagged ? "button-secondary" : "admin-danger-button", submission.flagged ? "Clear flag" : "Flag for investigation");
  toggle.type = "button";
  toggle.addEventListener("click", async () => {
    toggle.disabled = true;
    try {
      if (await updateFlag(competitionId, submission, !submission.flagged)) await loadFlags(body);
      else toggle.disabled = false;
    } catch (error) {
      window.alert(errorText(error));
      toggle.disabled = false;
    }
  });
  actions.append(toggle);
  row.append(actions);
  return row;
}

async function loadFlags(body) {
  const competitionId = selectedCompetitionId();
  if (!competitionId) {
    body.replaceChildren(el("div", "admin-static-field", "Select a competition first."));
    return;
  }
  body.replaceChildren(el("div", "admin-static-field", "Loading submission flags…"));
  try {
    const payload = await api(`${ROOT}/${encodeURIComponent(competitionId)}/submissions`);
    const submissions = Array.isArray(payload.submissions) ? payload.submissions : [];
    const toolbar = el("div", "admin-workspace-toolbar");
    toolbar.append(el("span", "admin-muted", `${submissions.filter((submission) => submission.flagged).length} flagged · ${submissions.length} total`));
    const refresh = el("button", "button-secondary", "Refresh");
    refresh.type = "button";
    refresh.addEventListener("click", () => loadFlags(body));
    toolbar.append(refresh);
    const list = el("div", "staff-submission-list");
    if (!submissions.length) list.append(el("div", "admin-static-field", "No submissions yet."));
    else submissions.forEach((submission) => list.append(submissionRow(competitionId, submission, body)));
    body.replaceChildren(toolbar, list);
  } catch (error) {
    body.replaceChildren(el("div", "admin-inline-alert admin-danger", errorText(error)));
  }
}

function init() {
  createPanel();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
