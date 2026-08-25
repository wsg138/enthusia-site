import { appealPlainText, renderAppealMarkup } from "./appeal-markup.js";

const authRoot = document.querySelector("#appeal-auth");
const form = document.querySelector("#appeal-form");
const accountSelect = document.querySelector("#appeal-account");
const punishmentSelect = document.querySelector("#appeal-punishment");
const punishmentStatus = document.querySelector("#punishment-result");
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
  punishments: [],
  selected: null,
  attachments: [],
  draftId: null,
  uploading: false,
  submitting: false
};

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
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
  submitButton.disabled = !state.selected || !answersValid() || state.uploading || state.submitting;
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

async function loadPunishments() {
  showPunishment(null);
  state.punishments = [];
  punishmentSelect.disabled = true;
  punishmentSelect.replaceChildren(new Option("Loading punishments…", ""));
  punishmentStatus.textContent = "Checking this account…";
  const minecraftUuid = accountSelect.value;
  if (!minecraftUuid) return;
  try {
    const response = await fetch(`/api/appeals/eligible?minecraftUuid=${encodeURIComponent(minecraftUuid)}`, {
      credentials: "same-origin",
      headers: { accept: "application/json" }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      punishmentSelect.replaceChildren(new Option("Punishments unavailable", ""));
      punishmentStatus.textContent = eligibilityMessage(payload, response.status);
      return;
    }
    state.punishments = Array.isArray(payload.punishments) ? payload.punishments : [];
    if (!state.punishments.length) {
      punishmentSelect.replaceChildren(new Option("No punishments available", ""));
      punishmentStatus.textContent = "There are no active punishments available to appeal for this account.";
      return;
    }
    punishmentSelect.replaceChildren(
      new Option("Choose a punishment", ""),
      ...state.punishments.map((punishment) => new Option(punishmentLabel(punishment), punishment.id))
    );
    punishmentSelect.disabled = false;
    punishmentStatus.textContent = state.punishments.length === 1
      ? "One punishment is available to appeal."
      : `${state.punishments.length} punishments are available to appeal.`;
  } catch {
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
    preview.href = attachment.previewUrl;
    preview.target = "_blank";
    preview.rel = "noopener";
    if (attachment.mimeType.startsWith("image/")) {
      const image = document.createElement("img");
      image.src = attachment.previewUrl;
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
      `${attachment.previewUrl}?draftId=${encodeURIComponent(state.draftId)}`,
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
  accountSelect.replaceChildren(...state.session.linkedMinecraftAccounts.map((account) => (
    new Option(account.name, account.uuid)
  )));
  accountSelect.value = state.session.linkedMinecraftAccounts[0].uuid;
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
      form.hidden = true;
      authPanel(
        "Sign in with Discord",
        "Your sign-in keeps the appeal tied to the right account. Discord server membership is not required.",
        linkButton("Sign in", signInHref())
      );
      setStep("account");
      return;
    }
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
    form.hidden = true;
    authPanel("Sign-in could not be checked", "Refresh the page before trying to submit an appeal.");
    setStep("account");
  }
}

function submissionMessage(payload, status) {
  if (payload?.error === "invalid_appeal") return "Check each answer and make sure it meets the minimum length.";
  if (payload?.error === "punishment_not_appealable") return "That punishment is no longer available to appeal. The list will be refreshed.";
  if (payload?.error === "appeal_attachment_conflict") return "One of the files changed before submission. Refresh the page and check the evidence list.";
  if (payload?.error === "appeal_draft_conflict") return "This draft was already sent with different answers. Refresh before starting another appeal.";
  if (status === 503) return "Your appeal could not be sent right now. Your answers and files are still here.";
  return `The appeal could not be sent (${status}).`;
}

async function submitAppeal(event) {
  event.preventDefault();
  if (!state.selected || !answersValid()) {
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
      if (responsePayload.error === "punishment_not_appealable") await loadPunishments();
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
  } catch {
    result.textContent = "Your appeal could not be sent right now. Your answers and files are still here.";
  } finally {
    state.submitting = false;
    updateSubmitState();
  }
}

accountSelect.addEventListener("change", loadPunishments);
punishmentSelect.addEventListener("change", () => {
  const selected = state.punishments.find((punishment) => punishment.id === punishmentSelect.value) ?? null;
  showPunishment(selected);
});
fileInput.addEventListener("change", () => uploadFiles(fileInput.files));
form.addEventListener("submit", submitAppeal);

for (const field of answerFields) {
  field.input.addEventListener("input", () => updateAnswer(field));
  field.root.querySelector("[data-preview]").addEventListener("click", (event) => togglePreview(field, event.currentTarget));
  for (const button of field.root.querySelectorAll("[data-format]")) {
    button.addEventListener("click", () => formatAnswer(field, button.dataset.format));
  }
  updateAnswer(field);
}

loadSession();
