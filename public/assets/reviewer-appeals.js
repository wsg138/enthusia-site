import { renderAppealMarkup } from "./appeal-markup.js";

const root = document.querySelector("#appeals");
const statusFilter = document.querySelector("#status");
const searchInput = document.querySelector("#review-search");
const refreshButton = document.querySelector("#refresh");
const queueStatus = document.querySelector("#reviewer-status");
let loadedAppeals = [];

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

function humanBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function reviewerAttachmentUrl(id) {
  return `/api/reviewer/appeals/attachments/${encodeURIComponent(String(id || ""))}`;
}

function setActionsDisabled(container, disabled) {
  for (const control of container.querySelectorAll("button, textarea")) control.disabled = disabled;
}

async function decide(appeal, decision, note, actionRoot, actionStatus) {
  if (note.trim().length < 3) {
    actionStatus.textContent = "Add a short note explaining the decision.";
    return;
  }
  const confirmation = {
    approve: "Accept this appeal and remove the punishment?",
    deny: "Deny this appeal?"
  }[decision];
  if (confirmation && !window.confirm(confirmation)) return;
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
  heading.append(element("h3", "", "Resolve appeal"), element("p", "", "The message is shown to the player."));
  const label = element("label", "reviewer-note");
  label.append(element("span", "", "Message to player"));
  const note = document.createElement("textarea");
  note.minLength = 3;
  note.maxLength = 1000;
  note.rows = 4;
  note.placeholder = "Explain the outcome or what information you need.";
  label.append(note);
  const buttons = element("div", "reviewer-decision-buttons");
  const actionStatus = element("p", "reviewer-action-status");
  actionStatus.setAttribute("role", "status");
  for (const action of [
    { label: "Accept and remove punishment", value: "approve", className: "reviewer-approve" },
    { label: "Ask for more information", value: "request_information", className: "reviewer-request" },
    { label: "Deny appeal", value: "deny", className: "reviewer-deny" }
  ]) {
    const button = element("button", `btn ${action.className}`, action.label);
    button.type = "button";
    button.addEventListener("click", () => decide(appeal, action.value, note.value, section, actionStatus));
    buttons.append(button);
  }
  const limitation = element("p", "reviewer-decision-limit", "Shortening a punishment still has to be done with the in-game staff command.");
  section.append(heading, label, buttons, limitation, actionStatus);
  return section;
}

const answerLabels = Object.freeze({
  whatHappened: "What happened?",
  whyReview: "What should staff reconsider?",
  ruleUnderstanding: "What does the player understand about the rule?",
  futureSteps: "What will the player do differently?",
  additionalContext: "Other context"
});

function structuredResponse(answers) {
  const response = element("section", "reviewer-response reviewer-structured-response");
  response.append(element("h3", "", "Appeal response"));
  for (const [field, label] of Object.entries(answerLabels)) {
    const value = String(answers?.[field] ?? "").trim();
    if (!value) continue;
    const answer = element("section", "reviewer-answer");
    answer.append(element("h4", "", label));
    const content = element("div", "reviewer-answer-content");
    renderAppealMarkup(content, value);
    answer.append(content);
    response.append(answer);
  }
  return response;
}

function legacyResponse(appeal) {
  const response = element("section", "reviewer-response");
  response.append(element("h3", "", "Appeal response"));
  response.append(element("pre", "", text(appeal.reason, "No response was provided.")));
  return response;
}

function evidence(attachments) {
  if (!attachments?.length) return null;
  const section = element("section", "reviewer-evidence");
  section.append(element("h3", "", "Evidence"));
  const list = element("ul", "reviewer-evidence-list");
  for (const attachment of attachments) {
    const previewUrl = reviewerAttachmentUrl(attachment.id);
    const item = element("li", "reviewer-evidence-item");
    const link = element("a", "reviewer-evidence-preview");
    link.href = previewUrl;
    link.target = "_blank";
    link.rel = "noopener";
    if (attachment.mimeType?.startsWith("image/")) {
      const image = document.createElement("img");
      image.src = previewUrl;
      image.alt = "";
      link.append(image);
    } else {
      link.textContent = "TXT";
    }
    const copy = element("div");
    copy.append(element("strong", "", attachment.name), element("span", "", humanBytes(attachment.byteSize)));
    const open = element("a", "reviewer-evidence-open", "Open");
    open.href = previewUrl;
    open.target = "_blank";
    open.rel = "noopener";
    item.append(link, copy, open);
    list.append(item);
  }
  section.append(list);
  return section;
}

async function postComment(appeal, body, button, input, result) {
  const message = body.trim();
  if (message.length < 3) {
    result.textContent = "Write a message before sending it.";
    input.focus();
    return;
  }
  button.disabled = true;
  input.disabled = true;
  result.textContent = "Sending…";
  try {
    const response = await fetch(`/api/reviewer/appeals/${encodeURIComponent(appeal.id)}/comments`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ body: message, idempotencyKey: crypto.randomUUID() })
    });
    if (!response.ok) {
      result.textContent = response.status === 404
        ? "Messages are not available for this older appeal."
        : `The message could not be sent (${response.status}).`;
      return;
    }
    await load();
  } catch {
    result.textContent = "The message could not be sent.";
  } finally {
    button.disabled = false;
    input.disabled = false;
  }
}

function conversation(appeal) {
  const section = element("section", "reviewer-conversation");
  const heading = element("div", "reviewer-conversation-heading");
  const comments = Array.isArray(appeal.comments) ? appeal.comments : [];
  heading.append(element("h3", "", "Conversation"), element("span", "", `${comments.length} message${comments.length === 1 ? "" : "s"}`));
  const list = element("ol", "reviewer-conversation-list");
  if (!comments.length) {
    list.append(element("li", "reviewer-conversation-empty", "No messages yet."));
  } else {
    for (const message of comments) {
      const item = element("li", `reviewer-message reviewer-message-${String(message.authorType).toLowerCase()}`);
      const meta = element("div", "reviewer-message-meta");
      meta.append(element("strong", "", text(message.authorName, message.authorType === "STAFF" ? "Staff" : "Player")), element("span", "", dateTime(message.createdAt)));
      item.append(meta, element("p", "", text(message.body, "No message provided.")));
      list.append(item);
    }
  }
  section.append(heading, list);

  const form = element("form", "reviewer-comment-form");
  const label = element("label");
  label.append(element("span", "", "Message player"));
  const input = document.createElement("textarea");
  input.minLength = 3;
  input.maxLength = 2000;
  input.rows = 4;
  input.required = true;
  input.placeholder = "Write a message the player can read with this appeal.";
  label.append(input);
  const controls = element("div", "reviewer-comment-controls");
  const button = element("button", "btn ghost", "Send message");
  button.type = "submit";
  const result = element("p");
  result.setAttribute("role", "status");
  controls.append(button, result);
  form.append(label, controls);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    postComment(appeal, input.value, button, input, result);
  });
  section.append(form);
  return section;
}

function appealCard(appeal) {
  const article = element("article", "card reviewer-appeal-card");
  const status = text(appeal.status, "UNKNOWN").toUpperCase();
  const header = element("header", "reviewer-card-header");
  const heading = document.createElement("div");
  heading.append(element("p", "card-kicker", `Case ${text(appeal.caseId, shortId(appeal.id))}`), element("h2", "", text(appeal.player ?? appeal.username, "Unknown player")));
  const lastComment = appeal.comments?.at(-1);
  const displayedStatus = status === "INFORMATION_REQUESTED" && lastComment?.authorType === "PLAYER"
    ? "Player replied"
    : statusNames[status] ?? status;
  header.append(heading, element("span", `reviewer-state reviewer-state-${status.toLowerCase().replaceAll("_", "-")}`, displayedStatus));

  const meta = element("dl", "reviewer-meta");
  meta.append(
    metadata("Punishment", text(appeal.punishmentType, "Punishment")),
    metadata("Punishment ID", shortId(appeal.punishmentId)),
    metadata("Submitted", dateTime(appeal.createdAt ?? appeal.submittedAt)),
    metadata("Version", String(appeal.version ?? 0))
  );

  const response = appeal.structuredAnswers ? structuredResponse(appeal.structuredAnswers) : legacyResponse(appeal);
  const disclosure = element("details", "reviewer-card-disclosure");
  const disclosureSummary = element("summary");
  disclosureSummary.append(element("strong", "", "Open appeal"), element("span", "", "Response, evidence, messages, and actions"));
  disclosure.append(disclosureSummary);
  const content = element("div", "reviewer-card-content");
  if (appeal.detailsState === "UNAVAILABLE") {
    const warning = element("div", "reviewer-details-warning");
    warning.append(element("strong", "", "Full response unavailable"), element("p", "", "Wait for the appeal site to recover before deciding this case."));
    content.append(warning);
  }
  content.append(response);
  const attachments = evidence(appeal.attachments);
  if (attachments) content.append(attachments);

  if (appeal.detailsState === "COMPLETE") content.append(conversation(appeal));

  const noteInConversation = appeal.comments?.some((comment) => comment.authorType === "STAFF" && comment.body === appeal.decisionNote);
  if (appeal.decisionNote && !noteInConversation) {
    const prior = element("section", "reviewer-prior-note");
    prior.append(element("strong", "", "Latest staff note"), element("p", "", appeal.decisionNote));
    content.append(prior);
  }
  if (["OPEN", "INFORMATION_REQUESTED"].includes(status) && appeal.detailsState !== "UNAVAILABLE") {
    content.append(decisionActions(appeal));
  }
  disclosure.append(content);
  article.append(header, meta, disclosure);
  return article;
}

function filteredAppeals() {
  const search = searchInput.value.trim().toLowerCase();
  if (!search) return loadedAppeals;
  return loadedAppeals.filter((appeal) => [
    appeal.player,
    appeal.username,
    appeal.caseId,
    appeal.id,
    appeal.punishmentId,
    appeal.punishmentType
  ].some((value) => String(value ?? "").toLowerCase().includes(search)));
}

function renderQueue() {
  const appeals = filteredAppeals();
  root.replaceChildren(...appeals.map(appealCard));
  if (searchInput.value.trim()) {
    queueStatus.textContent = `${appeals.length} of ${loadedAppeals.length} appeal${loadedAppeals.length === 1 ? "" : "s"}`;
  } else {
    queueStatus.textContent = appeals.length === 1 ? "1 appeal" : `${appeals.length} appeals`;
  }
  if (!appeals.length) root.append(element("div", "card reviewer-empty", "No appeals match this filter."));
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
      loadedAppeals = [];
      root.replaceChildren();
      queueStatus.textContent = response.status === 401 || response.status === 403
        ? "Your account is not authorized to review appeals."
        : `Appeals could not be loaded (${response.status}).`;
      return;
    }
    const payload = await response.json();
    loadedAppeals = Array.isArray(payload) ? payload : payload.appeals ?? [];
    renderQueue();
  } catch {
    loadedAppeals = [];
    root.replaceChildren();
    queueStatus.textContent = "The appeal service is not responding. Use Refresh to try again.";
  } finally {
    root.setAttribute("aria-busy", "false");
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", load);
statusFilter.addEventListener("change", load);
searchInput.addEventListener("input", renderQueue);
load();
