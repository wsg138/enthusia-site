const root = document.querySelector("#appeals");
const statusFilter = document.querySelector("#status");
const refreshButton = document.querySelector("#refresh");
const queueStatus = document.querySelector("#reviewer-status");

const statusNames = Object.freeze({
  OPEN: "Open",
  INFORMATION_REQUESTED: "Waiting for player",
  APPROVAL_PENDING: "Approval pending",
  APPLIED: "Approved",
  DENIED: "Denied",
  REJECTED: "Approval failed"
});

function text(value, fallback = "Not available") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function shortId(value) {
  const normalized = text(value, "");
  return normalized ? normalized.slice(0, 8).toUpperCase() : "UNKNOWN";
}

function dateTime(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? text(value) : parsed.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function metadata(label, value) {
  const wrapper = document.createElement("div");
  wrapper.append(element("dt", "", label), element("dd", "", value));
  return wrapper;
}

function setActionsDisabled(container, disabled) {
  for (const control of container.querySelectorAll("button, textarea")) control.disabled = disabled;
}

async function decide(appeal, decision, note, actionRoot, actionStatus) {
  if (note.trim().length < 3) {
    actionStatus.textContent = "Add a short note explaining the decision.";
    return;
  }
  actionStatus.textContent = "Saving decision…";
  setActionsDisabled(actionRoot, true);
  try {
    const response = await fetch(`/api/reviewer/appeals/${encodeURIComponent(appeal.id)}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        decision,
        note,
        expectedVersion: appeal.version,
        idempotencyKey: crypto.randomUUID()
      })
    });
    if (response.status === 409) {
      actionStatus.textContent = "This appeal changed while you were reviewing it. Refresh before deciding.";
      return;
    }
    if (!response.ok) {
      actionStatus.textContent = `The decision could not be saved (${response.status}).`;
      return;
    }
    actionStatus.textContent = "Decision saved.";
    await load();
  } catch {
    actionStatus.textContent = "The appeal service is not responding. Try again in a moment.";
  } finally {
    setActionsDisabled(actionRoot, false);
  }
}

function decisionActions(appeal) {
  const section = element("section", "reviewer-decision");
  const heading = element("div", "reviewer-decision-heading");
  heading.append(element("h3", "", "Record a decision"), element("p", "", "The note is kept with the appeal history."));
  const label = element("label", "reviewer-note");
  label.append(element("span", "", "Staff note"));
  const note = document.createElement("textarea");
  note.minLength = 3;
  note.maxLength = 1000;
  note.rows = 4;
  note.placeholder = "Explain the decision or what information is still needed.";
  label.append(note);
  const buttons = element("div", "reviewer-decision-buttons");
  const actionStatus = element("p", "reviewer-action-status");
  actionStatus.setAttribute("role", "status");
  for (const action of [
    { label: "Approve appeal", value: "approve", className: "reviewer-approve" },
    { label: "Request information", value: "request_information", className: "reviewer-request" },
    { label: "Deny appeal", value: "deny", className: "reviewer-deny" }
  ]) {
    const button = element("button", `btn ${action.className}`, action.label);
    button.type = "button";
    button.addEventListener("click", () => decide(appeal, action.value, note.value, section, actionStatus));
    buttons.append(button);
  }
  section.append(heading, label, buttons, actionStatus);
  return section;
}

function appealCard(appeal) {
  const article = element("article", "card reviewer-appeal-card");
  const status = text(appeal.status, "UNKNOWN").toUpperCase();
  const header = element("header", "reviewer-card-header");
  const heading = document.createElement("div");
  heading.append(element("p", "card-kicker", `Case ${text(appeal.caseId, shortId(appeal.id))}`), element("h2", "", text(appeal.player ?? appeal.username, "Unknown player")));
  header.append(heading, element("span", `reviewer-state reviewer-state-${status.toLowerCase().replaceAll("_", "-")}`, statusNames[status] ?? status));

  const details = element("dl", "reviewer-meta");
  details.append(
    metadata("Punishment", text(appeal.punishmentType, "Punishment")),
    metadata("Punishment ID", shortId(appeal.punishmentId)),
    metadata("Submitted", dateTime(appeal.createdAt ?? appeal.submittedAt)),
    metadata("Version", String(appeal.version ?? 0))
  );

  const response = element("section", "reviewer-response");
  response.append(element("h3", "", "Player response"));
  const reason = element("pre", "", text(appeal.reason, "No response was provided."));
  response.append(reason);
  article.append(header, details, response);

  if (appeal.decisionNote) {
    const prior = element("section", "reviewer-prior-note");
    prior.append(element("strong", "", "Latest staff note"), element("p", "", appeal.decisionNote));
    article.append(prior);
  }
  if (status === "OPEN") article.append(decisionActions(appeal));
  return article;
}

async function load() {
  queueStatus.textContent = "Loading appeals…";
  root.setAttribute("aria-busy", "true");
  refreshButton.disabled = true;
  try {
    const response = await fetch(`/api/reviewer/appeals?status=${encodeURIComponent(statusFilter.value)}`, {
      credentials: "same-origin",
      headers: { accept: "application/json" }
    });
    if (!response.ok) {
      root.replaceChildren();
      queueStatus.textContent = response.status === 401 || response.status === 403
        ? "Your account is not authorized to review appeals."
        : `Appeals could not be loaded (${response.status}).`;
      return;
    }
    const payload = await response.json();
    const appeals = Array.isArray(payload) ? payload : payload.appeals ?? [];
    root.replaceChildren(...appeals.map(appealCard));
    queueStatus.textContent = appeals.length === 1 ? "1 appeal" : `${appeals.length} appeals`;
    if (!appeals.length) root.append(element("div", "card reviewer-empty", "No appeals match this filter."));
  } catch {
    root.replaceChildren();
    queueStatus.textContent = "The appeal service is not responding. Use Refresh to try again.";
  } finally {
    root.setAttribute("aria-busy", "false");
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", load);
statusFilter.addEventListener("change", load);
load();
