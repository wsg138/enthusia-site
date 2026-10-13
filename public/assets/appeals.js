import { appealPlainText, renderAppealMarkup } from "./appeal-markup.js";

const authRoot = document.querySelector("#appeal-auth");
const historyAuthRoot = document.querySelector("#appeal-history-auth");
const historyRoot = document.querySelector("#appeal-history");
const historyPanel = document.querySelector("#appeal-history-panel");
const newPanel = document.querySelector("#appeal-new-panel");
const viewButtons = [...document.querySelectorAll("[data-appeal-view]")];
const form = document.querySelector("#appeal-form");
const accountSelect = document.querySelector("#appeal-account");
const punishmentSelect = document.querySelector("#appeal-punishment");
const punishmentStatus = document.querySelector("#punishment-result");
const expiredControl = document.querySelector("#expired-punishments-control");
const includeExpired = document.querySelector("#include-expired-punishments");
const olderPunishments = document.querySelector("#load-older-punishments");
let punishmentRequest = 0;
const requestedPunishment = new URLSearchParams(location.search).get("punishmentId");
const punishmentRoot = document.querySelector("#selected-punishment");
const questionsRoot = document.querySelector("#appeal-questions");
const submitButton = document.querySelector("#submit-appeal");
const result = document.querySelector("#appeal-result");
const fileInput = document.querySelector("#appeal-files");
const attachmentStatus = document.querySelector("#attachment-status");
const attachmentList = document.querySelector("#appeal-attachments");
const steps = Object.fromEntries([...document.querySelectorAll("[data-appeal-step]")].map((node) => [node.dataset.appealStep, node]));
const answerFields = [...document.querySelectorAll("[data-answer-field]")].map((root) => {
  const input = root.querySelector("textarea");
  return {
    name: root.dataset.answerField,
    root,
    input,
    count: root.querySelector("small span"),
    preview: root.querySelector("[data-answer-preview]"),
    minimum: Number(input.minLength) || 0
  };
});

const state = {
  session: null,
  appeals: [],
  punishments: [],
  selected: null,
  nextCursor: null,
  attachments: [],
  draftId: null,
  uploading: false,
  submitting: false,
  focusedAppealId: null
};

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const statusCopy = Object.freeze({
  OPEN: {
    label: "Submitted",
    message: "Staff have not decided this appeal yet."
  },
  INFORMATION_REQUESTED: {
    label: "Reply needed",
    message: "Staff left a message and need more information."
  },
  APPROVAL_PENDING: {
    label: "Accepted",
    message: "Staff accepted this appeal. The punishment change is being applied."
  },
  APPLIED: {
    label: "Accepted",
    message: "Staff accepted this appeal and updated the punishment."
  },
  DENIED: {
    label: "Denied",
    message: "Staff denied this appeal."
  },
  REJECTED: {
    label: "Staff follow-up needed",
    message: "The punishment change could not be completed. Staff need to check it."
  }
});

const answerLabels = Object.freeze({
  whatHappened: "What happened?",
  whyReview: "What should staff reconsider?",
  ruleUnderstanding: "What do you understand about the rule involved?",
  futureSteps: "What will you do differently?",
  additionalContext: "Anything else staff should check"
});

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function playerAttachmentUrl(id) {
  return `/api/appeals/attachments/${encodeURIComponent(String(id || ""))}`;
}

function signInHref() {
  const returnTo = `${window.location.pathname}${window.location.search}`;
  return `/api/competitions/auth/discord/start?returnTo=${encodeURIComponent(returnTo)}`;
}

function accountName(session) {
  return session.discord?.globalName || session.discord?.username || "Discord account";
}

function setStep(active, completed = []) {
  for (const [name, node] of Object.entries(steps)) {
    node.classList.toggle("is-active", name === active);
    node.classList.toggle("is-complete", completed.includes(name));
  }
}

function authPanel(title, copy, action = null) {
  const body = element("div");
  body.append(element("p", "card-kicker", "Your account"), element("h2", "", title), element("p", "", copy));
  authRoot.replaceChildren(body);
  if (action) authRoot.append(action);
}

function linkButton(label, href, className = "btn") {
  const link = element("a", className, label);
  link.href = href;
  return link;
}

function setView(view, updateUrl = false) {
  const selected = view === "new" ? "new" : "history";
  historyPanel.hidden = selected !== "history";
  newPanel.hidden = selected !== "new";
  for (const button of viewButtons) {
    const active = button.dataset.appealView === selected;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  }
  if (updateUrl) {
    const url = new URL(window.location.href);
    url.hash = selected;
    window.history.replaceState(null, "", url);
  }
}

function historyAuthPanel(title, copy, action = null) {
  const body = element("div");
  body.append(element("p", "card-kicker", "Your account"), element("h2", "", title), element("p", "", copy));
  historyAuthRoot.replaceChildren(body);
  if (action) historyAuthRoot.append(action);
}

function dateTime(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Date unavailable"
    : parsed.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function shortId(value) {
  return String(value ?? "").slice(0, 8).toUpperCase() || "UNKNOWN";
}

function requestedAppealId() {
  const value = new URLSearchParams(window.location.search).get("appeal")?.trim() ?? "";
  return canonicalUuid.test(value) ? value.toLowerCase() : null;
}

function focusRequestedAppeal() {
  const appealId = requestedAppealId();
  if (!appealId || state.focusedAppealId === appealId) return;
  const card = [...historyRoot.querySelectorAll("[data-appeal-id]")]
    .find((candidate) => candidate.dataset.appealId === appealId);
  if (!card) return;
  state.focusedAppealId = appealId;
  card.focus({ preventScroll: true });
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  card.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
}

function typeLabel(value) {
  const label = String(value || "Punishment").replaceAll("_", " ").toLowerCase();
  return label.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function appealComments(appeal) {
  const section = element("section", "appeal-thread");
  const heading = element("div", "appeal-thread-heading");
  heading.append(element("h3", "", "Messages"), element("span", "", `${appeal.comments.length} message${appeal.comments.length === 1 ? "" : "s"}`));
  section.append(heading);
  const list = element("ol", "appeal-thread-list");
  if (!appeal.comments.length) {
    list.append(element("li", "appeal-thread-empty", "No messages yet."));
  } else {
    for (const message of appeal.comments) {
      const item = element("li", `appeal-thread-message appeal-thread-${message.authorType.toLowerCase()}`);
      const meta = element("div", "appeal-thread-meta");
      const author = message.authorType === "STAFF" ? message.authorName : "You";
      meta.append(element("strong", "", author), element("span", "", dateTime(message.createdAt)));
      const body = element("p", "", message.body);
      item.append(meta, body);
      list.append(item);
    }
  }
  section.append(list);
  if (["OPEN", "INFORMATION_REQUESTED"].includes(appeal.status)) {
    section.append(commentForm(appeal));
  }
  return section;
}

function commentForm(appeal) {
  const form = element("form", "appeal-reply-form");
  const label = element("label");
  label.append(element("span", "", appeal.status === "INFORMATION_REQUESTED" ? "Reply to staff" : "Add a message"));
  const input = document.createElement("textarea");
  input.name = "comment";
  input.minLength = 3;
  input.maxLength = 2000;
  input.rows = 4;
  input.required = true;
  input.placeholder = appeal.status === "INFORMATION_REQUESTED"
    ? "Answer the staff member's question."
    : "Add something staff should know about this appeal.";
  label.append(input);
  const controls = element("div", "appeal-reply-controls");
  const button = element("button", "btn ghost", "Send message");
  button.type = "submit";
  const replyStatus = element("p");
  replyStatus.setAttribute("role", "status");
  controls.append(button, replyStatus);
  form.append(label, controls);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = input.value.trim();
    if (body.length < 3) {
      replyStatus.textContent = "Write a message before sending it.";
      input.focus();
      return;
    }
    button.disabled = true;
    input.disabled = true;
    replyStatus.textContent = "Sending…";
    try {
      const response = await fetch(`/api/appeals/${encodeURIComponent(appeal.id)}/comments`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ body, idempotencyKey: crypto.randomUUID() })
      });
      if (!response.ok) {
        replyStatus.textContent = response.status === 409
          ? "This appeal is closed or changed. Refresh the page."
          : "The message could not be sent.";
        return;
      }
      await loadAppealHistory();
    } catch {
      replyStatus.textContent = "The message could not be sent.";
    } finally {
      button.disabled = false;
      input.disabled = false;
    }
  });
  return form;
}

function originalAppeal(appeal) {
  const details = element("details", "appeal-original");
  details.append(element("summary", "", "View original appeal"));
  const answers = element("div", "appeal-original-answers");
  for (const [field, label] of Object.entries(answerLabels)) {
    const value = String(appeal.answers?.[field] ?? "").trim();
    if (!value) continue;
    const answer = element("section", "appeal-original-answer");
    answer.append(element("h4", "", label));
    const content = element("div", "appeal-original-content");
    renderAppealMarkup(content, value);
    answer.append(content);
    answers.append(answer);
  }
  details.append(answers);
  if (appeal.attachments.length) {
    const evidence = element("section", "appeal-original-evidence");
    evidence.append(element("h4", "", "Files"));
    const list = element("ul");
    for (const attachment of appeal.attachments) {
      const link = element("a", "", `${attachment.name} · ${humanBytes(attachment.byteSize)}`);
      link.href = playerAttachmentUrl(attachment.id);
      link.target = "_blank";
      link.rel = "noopener";
      const item = document.createElement("li");
      item.append(link);
      list.append(item);
    }
    evidence.append(list);
    details.append(evidence);
  }
  return details;
}

function appealHistoryCard(appeal) {
  const lastComment = appeal.comments.at(-1);
  const playerReplied = appeal.status === "INFORMATION_REQUESTED" && lastComment?.authorType === "PLAYER";
  const status = playerReplied
    ? { label: "Reply sent", message: "Your message was sent. Staff will review it with the appeal." }
    : statusCopy[appeal.status] ?? { label: typeLabel(appeal.status), message: "Check the messages below for the latest update." };
  const article = element("article", "card appeal-history-card");
  const appealId = String(appeal.id ?? "").toLowerCase();
  article.dataset.appealId = appealId;
  article.tabIndex = -1;
  article.classList.toggle("is-targeted", appealId === requestedAppealId());
  const header = element("header", "appeal-history-card-header");
  const heading = element("div");
  heading.append(
    element("p", "card-kicker", appeal.caseId ? `Case ${appeal.caseId}` : `Appeal ${shortId(appeal.id)}`),
    element("h2", "", `${typeLabel(appeal.punishmentType)} · ${appeal.minecraftName}`)
  );
  const stateBadge = element("span", `appeal-history-state appeal-history-state-${appeal.status.toLowerCase().replaceAll("_", "-")}`, status.label);
  header.append(heading, stateBadge);
  const summary = element("div", "appeal-history-summary");
  summary.append(element("p", "", status.message), element("time", "", `Sent ${dateTime(appeal.submittedAt ?? appeal.createdAt)}`));
  article.append(header, summary, appealComments(appeal), originalAppeal(appeal));
  return article;
}

function renderAppealHistory() {
  historyRoot.replaceChildren();
  if (!state.appeals.length) {
    const empty = element("section", "card appeal-history-empty");
    empty.append(
      element("p", "card-kicker", "No appeals"),
      element("h2", "", "You have not submitted an appeal."),
      element("p", "", "If you have a punishment that can be appealed, start a new appeal here.")
    );
    const button = element("button", "btn", "Start an appeal");
    button.type = "button";
    button.addEventListener("click", () => setView("new", true));
    empty.append(button);
    historyRoot.append(empty);
    return;
  }
  historyRoot.append(...state.appeals.map(appealHistoryCard));
  focusRequestedAppeal();
}

async function loadAppealHistory() {
  historyRoot.setAttribute("aria-busy", "true");
  try {
    const response = await fetch("/api/appeals", {
      credentials: "same-origin",
      headers: { accept: "application/json" }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      state.appeals = [];
      historyRoot.replaceChildren(element("div", "card appeal-history-error", "Your appeals could not be loaded. Refresh the page to try again."));
      return;
    }
    state.appeals = Array.isArray(payload.appeals) ? payload.appeals : [];
    renderAppealHistory();
  } catch {
    state.appeals = [];
    historyRoot.replaceChildren(element("div", "card appeal-history-error", "Your appeals could not be loaded. Refresh the page to try again."));
  } finally {
    historyRoot.setAttribute("aria-busy", "false");
  }
}

function draftStorageKey() {
  return state.session?.discord?.id ? `enthusia.appeal-draft.v1.${state.session.discord.id}` : null;
}

function loadDraftId() {
  const key = draftStorageKey();
  let stored = null;
  try { stored = key ? sessionStorage.getItem(key) : null; } catch { stored = null; }
  state.draftId = /^[0-9a-f-]{36}$/i.test(stored ?? "") ? stored.toLowerCase() : crypto.randomUUID();
  try { if (key) sessionStorage.setItem(key, state.draftId); } catch { /* The draft still works for this page load. */ }
}

function resetDraftId() {
  const key = draftStorageKey();
  state.draftId = crypto.randomUUID();
  try { if (key) sessionStorage.setItem(key, state.draftId); } catch { /* The draft still works for this page load. */ }
}

function validateAnswer(field) {
  const length = appealPlainText(field.input.value).length;
  field.input.setCustomValidity(field.minimum > 0 && length < field.minimum
    ? `Write at least ${field.minimum} characters in your own words.`
    : "");
  return field.input.validity.valid;
}

function answersValid() {
  return answerFields.every(validateAnswer);
}

function updateSubmitState() {
  submitButton.disabled = !state.selected || state.selected.appealable === false || !answersValid() || state.uploading || state.submitting;
}

function updateAnswer(field) {
  field.count.textContent = field.input.value.length.toLocaleString();
  validateAnswer(field);
  if (!field.preview.hidden) renderAppealMarkup(field.preview, field.input.value);
  updateSubmitState();
}

function selectedLines(input, prefix) {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const lineStart = input.value.lastIndexOf("\n", start - 1) + 1;
  const nextLine = input.value.indexOf("\n", end);
  const lineEnd = nextLine === -1 ? input.value.length : nextLine;
  const selected = input.value.slice(lineStart, lineEnd);
  input.setRangeText(selected.split("\n").map((line) => `${prefix}${line}`).join("\n"), lineStart, lineEnd, "select");
}

function wrapSelection(input, before, after = before, fallback = "text") {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const selected = input.value.slice(start, end) || fallback;
  input.setRangeText(`${before}${selected}${after}`, start, end, "select");
  input.setSelectionRange(start + before.length, start + before.length + selected.length);
}

function formatAnswer(field, format) {
  const input = field.input;
  input.focus();
  if (format === "bold") wrapSelection(input, "**");
  if (format === "italic") wrapSelection(input, "_");
  if (format === "heading") selectedLines(input, "## ");
  if (format === "list") selectedLines(input, "- ");
  if (format === "quote") selectedLines(input, "> ");
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function togglePreview(field, button) {
  field.preview.hidden = !field.preview.hidden;
  button.textContent = field.preview.hidden ? "Preview" : "Edit";
  field.input.hidden = !field.preview.hidden;
  if (!field.preview.hidden) renderAppealMarkup(field.preview, field.input.value);
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString([], { dateStyle: "medium" });
}

function punishmentLabel(punishment) {
  const date = formatDate(punishment.createdAt);
  return [punishment.type, punishment.caseId ? `Case ${punishment.caseId}` : null, date].filter(Boolean).join(" · ");
}

function showPunishment(punishment) {
  state.selected = punishment;
  punishmentRoot.hidden = !punishment;
  punishmentRoot.replaceChildren();
  questionsRoot.hidden = !punishment;
  if (punishment) {
    const heading = element("div", "appeal-sanction-heading");
    heading.append(element("strong", "", punishment.type), element("span", "", punishment.caseId ? `Case ${punishment.caseId}` : "Appealable punishment"));
    const reason = element("p", "", punishment.reason);
    punishmentRoot.append(heading, reason);
    if (punishment.active === false) punishmentRoot.append(element("p", "", "This punishment has expired. You can still ask staff to review it."));
    if (punishment.appealable === false) punishmentRoot.append(element("p", "appeal-selection-status", `You can appeal this punishment again on ${new Date(punishment.nextAppealAt).toLocaleString()}. Each punishment can be appealed once every 14 days.`));
    setStep("appeal", ["account", "punishment"]);
  } else if (state.session?.authenticated) {
    setStep("punishment", ["account"]);
  }
  updateSubmitState();
}

function eligibilityMessage(payload, status) {
  if (status === 401) return "Sign in again before continuing.";
  if (payload?.error === "minecraft_link_required") return "Link a Minecraft account before starting an appeal.";
  if (status === 503) return "Punishments could not be loaded right now. Try again in a few minutes.";
  return `Punishments could not be loaded (${status}).`;
}

async function loadPunishments(append = false) {
  const requestId = ++punishmentRequest;
  const minecraftUuid = accountSelect.value;
  const previousSelection = append ? punishmentSelect.value : requestedPunishment;
  if (!append) { showPunishment(null); state.punishments = []; state.nextCursor = null; }
  punishmentSelect.disabled = true;
  olderPunishments.hidden = true;
  punishmentStatus.textContent = "Checking this account…";
  if (!minecraftUuid) return;
  const query = new URLSearchParams({ minecraftUuid });
  if (state.session?.linkedPunishmentAppeals && includeExpired.checked) query.set("includeExpired", "1");
  if (append && state.nextCursor) query.set("cursor", state.nextCursor);
  try {
    const response = await fetch(`/api/appeals/eligible?${query}`, {
      credentials: "same-origin", headers: { accept: "application/json" }
    });
    const payload = await response.json().catch(() => ({}));
    if (requestId !== punishmentRequest) return;
    if (!response.ok) {
      punishmentSelect.replaceChildren(new Option("Punishments unavailable", ""));
      punishmentStatus.textContent = eligibilityMessage(payload, response.status);
      return;
    }
    const incoming = Array.isArray(payload.punishments) ? payload.punishments : [];
    state.punishments = append ? [...state.punishments, ...incoming.filter(item => !state.punishments.some(old => old.id === item.id))] : incoming;
    state.nextCursor = payload.nextCursor || null;
    olderPunishments.hidden = !state.nextCursor;
    punishmentSelect.replaceChildren(new Option(state.punishments.length ? "Choose a punishment" : "No punishments available", ""),
      ...state.punishments.map(punishment => new Option(punishmentLabel(punishment), punishment.id)));
    punishmentSelect.disabled = !state.punishments.length;
    punishmentStatus.textContent = state.punishments.length
      ? `${state.punishments.length} punishment${state.punishments.length === 1 ? "" : "s"} found. Select one to check its appeal availability.`
      : `There are no ${includeExpired.checked ? "active or expired" : "active"} punishments for this account.`;
    const selected = state.punishments.find(item => item.id === previousSelection);
    if (selected) { punishmentSelect.value = selected.id; showPunishment(selected); }
  } catch {
    if (requestId !== punishmentRequest) return;
    punishmentSelect.replaceChildren(new Option("Punishments unavailable", ""));
    punishmentStatus.textContent = "Punishments could not be loaded right now. Try again in a few minutes.";
  }
}

function humanBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderAttachments() {
  attachmentList.replaceChildren();
  for (const attachment of state.attachments) {
    const item = element("li", "appeal-attachment-item");
    const preview = element("a", "appeal-attachment-preview");
    const previewUrl = playerAttachmentUrl(attachment.id);
    preview.href = previewUrl;
    preview.target = "_blank";
    preview.rel = "noopener";
    if (attachment.mimeType.startsWith("image/")) {
      const image = document.createElement("img");
      image.src = previewUrl;
      image.alt = "";
      preview.append(image);
    } else {
      preview.textContent = "TXT";
    }
    const details = element("div", "appeal-attachment-copy");
    details.append(element("strong", "", attachment.name), element("span", "", humanBytes(attachment.byteSize)));
    const remove = element("button", "appeal-attachment-remove", "Remove");
    remove.type = "button";
    remove.addEventListener("click", () => removeAttachment(attachment, remove));
    item.append(preview, details, remove);
    attachmentList.append(item);
  }
}

async function restoreAttachments() {
  if (!state.draftId) return;
  try {
    const response = await fetch(`/api/appeals/attachments?draftId=${encodeURIComponent(state.draftId)}`, {
      credentials: "same-origin",
      headers: { accept: "application/json" }
    });
    const payload = await response.json().catch(() => ({}));
    state.attachments = response.ok && Array.isArray(payload.attachments) ? payload.attachments : [];
  } catch {
    state.attachments = [];
  }
  renderAttachments();
}

function attachmentError(payload, status) {
  const code = payload?.error;
  if (code === "attachment_limit_reached") return "This appeal already has five files.";
  if (code === "attachment_total_too_large" || code === "attachment_too_large") return "That file is too large.";
  if (code === "unsupported_attachment_type" || code === "attachment_type_mismatch") return "Use a PNG, JPG, TXT, or LOG file.";
  if (code === "image_metadata_not_stripped") return "That image contains private metadata. Export a clean screenshot and try again.";
  if (code === "rate_limited") return "Too many uploads were attempted. Wait a few minutes and try again.";
  return `The file could not be uploaded (${status}).`;
}

async function uploadFiles(files) {
  if (!state.selected) return;
  state.uploading = true;
  updateSubmitState();
  const available = Math.max(0, 5 - state.attachments.length);
  const selected = [...files].slice(0, available);
  if (!selected.length) {
    attachmentStatus.textContent = "This appeal already has five files.";
    state.uploading = false;
    updateSubmitState();
    return;
  }
  for (const file of selected) {
    attachmentStatus.textContent = `Uploading ${file.name}…`;
    const body = new FormData();
    body.set("draftId", state.draftId);
    body.set("file", file);
    try {
      const response = await fetch("/api/appeals/attachments", {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json" },
        body
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        attachmentStatus.textContent = attachmentError(payload, response.status);
        break;
      }
      state.attachments.push(payload.attachment);
      renderAttachments();
      attachmentStatus.textContent = `${payload.attachment.name} added.`;
    } catch {
      attachmentStatus.textContent = "The file could not be uploaded right now. Try again.";
      break;
    }
  }
  fileInput.value = "";
  state.uploading = false;
  updateSubmitState();
}

async function removeAttachment(attachment, button) {
  button.disabled = true;
  attachmentStatus.textContent = `Removing ${attachment.name}…`;
  try {
    const response = await fetch(
      `${playerAttachmentUrl(attachment.id)}?draftId=${encodeURIComponent(state.draftId)}`,
      { method: "DELETE", credentials: "same-origin", headers: { accept: "application/json" } }
    );
    if (!response.ok) throw new Error("delete_failed");
    state.attachments = state.attachments.filter((item) => item.id !== attachment.id);
    renderAttachments();
    attachmentStatus.textContent = `${attachment.name} removed.`;
  } catch {
    attachmentStatus.textContent = "That file could not be removed. Refresh before submitting.";
    button.disabled = false;
  }
}

function populateAccounts() {
  if (state.session.linkedPunishmentAppeals) document.querySelector("#punishment-selection-policy").textContent = "Active punishments are shown by default. Each punishment can be appealed once every 14 days.";
  accountSelect.replaceChildren(...state.session.linkedMinecraftAccounts.map((account) => (
    new Option(account.name, account.uuid)
  )));
  const query = new URLSearchParams(location.search);
  const requestedAccount = query.get("minecraftUuid");
  accountSelect.value = state.session.linkedMinecraftAccounts.find(account => account.uuid === requestedAccount)?.uuid || state.session.linkedMinecraftAccounts[0].uuid;
  expiredControl.hidden = !state.session.linkedPunishmentAppeals;
  includeExpired.checked = Boolean(state.session.linkedPunishmentAppeals && query.get("includeExpired") === "1");
  loadPunishments();
}

async function loadSession() {
  try {
    const response = await fetch("/api/competitions/auth/session", {
      credentials: "same-origin",
      headers: { accept: "application/json" }
    });
    const session = response.ok ? await response.json() : { authenticated: false };
    state.session = session;
    if (!session.authenticated) {
      historyRoot.replaceChildren();
      historyRoot.setAttribute("aria-busy", "false");
      historyAuthPanel(
        "Sign in to see your appeals",
        "Your appeal history and staff replies are available after you sign in.",
        linkButton("Sign in", signInHref())
      );
      form.hidden = true;
      authPanel(
        "Sign in with Discord",
        "Your sign-in keeps the appeal tied to the right account. Discord server membership is not required.",
        linkButton("Sign in", signInHref())
      );
      setStep("account");
      return;
    }
    historyAuthPanel(
      `Signed in as ${accountName(session)}`,
      "Appeals and staff messages for your linked account are shown below.",
      linkButton("Profile", "/account.html", "btn ghost")
    );
    await loadAppealHistory();
    if (!session.linkedMinecraftAccounts?.length) {
      form.hidden = true;
      authPanel(
        "Link a Minecraft account",
        "Link your Minecraft account so we can show the punishments available to appeal.",
        linkButton("Manage account links", "/account.html")
      );
      setStep("account");
      return;
    }
    authPanel(
      `Signed in as ${accountName(session)}`,
      `${session.linkedMinecraftAccounts.length} linked Minecraft account${session.linkedMinecraftAccounts.length === 1 ? "" : "s"}.`,
      linkButton("Manage links", "/account.html", "btn ghost")
    );
    form.hidden = false;
    loadDraftId();
    await restoreAttachments();
    populateAccounts();
    setStep("punishment", ["account"]);
  } catch {
    historyRoot.replaceChildren();
    historyRoot.setAttribute("aria-busy", "false");
    historyAuthPanel("Sign-in could not be checked", "Refresh the page to load your appeals.");
    form.hidden = true;
    authPanel("Sign-in could not be checked", "Refresh the page before trying to submit an appeal.");
    setStep("account");
  }
}

function submissionMessage(payload, status) {  if (typeof payload?.error === "object") payload = { ...payload, error: payload.error?.code?.toLowerCase() };
  if (payload?.error === "invalid_appeal") return "Check each answer and make sure it meets the minimum length.";
  if (payload?.error === "punishment_not_appealable") return "That punishment is no longer available to appeal. The list will be refreshed.";
  if (payload?.error === "appeal_attachment_conflict") return "One of the files changed before submission. Refresh the page and check the evidence list.";
  if (payload?.error === "appeal_draft_conflict") return "This draft was already sent with different answers. Refresh before starting another appeal.";
  if (payload?.error === "appeal_cooldown") return "This punishment can be appealed once every 14 days. Check its next available date above.";
  if (status === 429) return "Please wait before submitting another appeal.";
  if (status === 503) return "Your appeal could not be sent right now. Your answers and files are still here.";
  return `The appeal could not be sent (${status}).`;
}

async function submitAppeal(event) {
  event.preventDefault();
  if (!state.selected || state.selected.appealable === false || !answersValid()) {
    result.textContent = "Complete every required answer before sending the appeal.";
    form.reportValidity();
    updateSubmitState();
    return;
  }
  state.submitting = true;
  result.textContent = "Sending appeal…";
  updateSubmitState();
  const answers = Object.fromEntries(answerFields.map((field) => [field.name, field.input.value]));
  const payload = {
    draftId: state.draftId,
    minecraftUuid: accountSelect.value,
    punishmentId: state.selected.id,
    attachmentIds: state.attachments.map((attachment) => attachment.id),
    ...answers
  };
  try {
    const response = await fetch("/api/appeals", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload)
    });
    const responsePayload = await response.json().catch(() => ({}));
    if (!response.ok) {
      result.textContent = submissionMessage(responsePayload, response.status);
      const errorCode = typeof responsePayload.error === "string" ? responsePayload.error : responsePayload.error?.code?.toLowerCase();      if (["punishment_not_appealable", "appeal_cooldown"].includes(errorCode)) await loadPunishments();
      return;
    }
    result.textContent = "Appeal sent. Staff can now review it.";
    form.reset();
    for (const field of answerFields) updateAnswer(field);
    state.attachments = [];
    renderAttachments();
    attachmentStatus.textContent = "";
    resetDraftId();
    await loadPunishments();
    await loadAppealHistory();
    setView("history", true);
  } catch {
    result.textContent = "Your appeal could not be sent right now. Your answers and files are still here.";
  } finally {
    state.submitting = false;
    updateSubmitState();
  }
}

accountSelect.addEventListener("change", () => loadPunishments());
includeExpired.addEventListener("change", () => loadPunishments());
olderPunishments.addEventListener("click", () => loadPunishments(true));
punishmentSelect.addEventListener("change", () => {
  const selected = state.punishments.find((punishment) => punishment.id === punishmentSelect.value) ?? null;
  showPunishment(selected);
});
fileInput.addEventListener("change", () => uploadFiles(fileInput.files));
form.addEventListener("submit", submitAppeal);

for (const button of viewButtons) {
  button.addEventListener("click", () => setView(button.dataset.appealView, true));
  button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const index = viewButtons.indexOf(button);
    const next = viewButtons[(index + direction + viewButtons.length) % viewButtons.length];
    next.focus();
    setView(next.dataset.appealView, true);
  });
}
for (const link of document.querySelectorAll("[data-open-appeal]")) {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    setView("new", true);
    newPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}
window.addEventListener("hashchange", () => setView(window.location.hash === "#new" ? "new" : "history"));

for (const field of answerFields) {
  field.input.addEventListener("input", () => updateAnswer(field));
  field.root.querySelector("[data-preview]").addEventListener("click", (event) => togglePreview(field, event.currentTarget));
  for (const button of field.root.querySelectorAll("[data-format]")) {
    button.addEventListener("click", () => formatAnswer(field, button.dataset.format));
  }
  updateAnswer(field);
}

setView(window.location.hash === "#new" ? "new" : "history");
loadSession();
