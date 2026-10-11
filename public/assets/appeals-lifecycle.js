const historyRoot = document.querySelector("#appeal-history");
const EDITABLE_STATUS = "OPEN";
const answerFields = Object.freeze([
  ["whatHappened", "What happened?", 150, 4000],
  ["whyReview", "What should staff reconsider?", 120, 3000],
  ["ruleUnderstanding", "What do you understand about the rule involved?", 100, 2500],
  ["futureSteps", "What will you do differently?", 100, 2500],
  ["additionalContext", "Anything else staff should check", 0, 3000]
]);
let refreshTimer = null;
let loading = false;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function answerForm(appeal) {
  const details = element("details", "appeal-edit-panel");
  details.dataset.appealLifecycle = "edit";
  details.append(element("summary", "", "Edit appeal"));
  const form = element("form", "appeal-edit-form");
  form.append(element("p", "appeal-edit-help", "You can edit your written answers until a staff member claims this appeal. Evidence files stay unchanged."));
  const inputs = new Map();
  for (const [field, labelText, minimum, maximum] of answerFields) {
    const label = element("label", "appeal-field");
    label.append(element("span", "", labelText));
    const input = document.createElement("textarea");
    input.name = field;
    input.value = String(appeal.answers?.[field] ?? "");
    input.minLength = minimum;
    input.maxLength = maximum;
    input.rows = field === "additionalContext" ? 5 : 7;
    input.required = minimum > 0;
    label.append(input);
    form.append(label);
    inputs.set(field, input);
  }
  const status = element("p", "appeal-edit-status");
  status.setAttribute("role", "status");
  const button = element("button", "btn ghost", "Save changes");
  button.type = "submit";
  form.append(button, status);
  form.addEventListener("submit", (event) => saveEdit(event, appeal, inputs, button, status));
  details.append(form);
  return details;
}

async function saveEdit(event, appeal, inputs, button, status) {
  event.preventDefault();
  if (![...inputs.values()].every((input) => input.reportValidity())) return;
  button.disabled = true;
  status.textContent = "Saving…";
  const answers = Object.fromEntries([...inputs].map(([field, input]) => [field, input.value]));
  try {
    const response = await fetch(`/api/appeals/${encodeURIComponent(appeal.id)}/edit`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        expectedVersion: Number(appeal.version),
        idempotencyKey: crypto.randomUUID(),
        answers
      })
    });
    if (response.status === 409) {
      status.textContent = "This appeal changed or was claimed. Refresh before editing again.";
      return;
    }
    if (!response.ok) {
      status.textContent = `The appeal could not be updated (${response.status}).`;
      return;
    }
    status.textContent = "Appeal updated.";
    window.location.reload();
  } catch {
    status.textContent = "The appeal service is not responding. Try again.";
  } finally {
    button.disabled = false;
  }
}

function decorateCard(card, appeal) {
  const signature = `${appeal.version}:${appeal.status}:${appeal.claimed}`;
  if (card.dataset.lifecycleSignature === signature) return;
  card.dataset.lifecycleSignature = signature;
  card.querySelectorAll("[data-appeal-lifecycle]").forEach((node) => node.remove());

  if (appeal.status === EDITABLE_STATUS && appeal.claimed) {
    card.querySelector(".appeal-reply-form")?.remove();
    const lock = element("p", "appeal-claim-lock", "A staff member has claimed this appeal. Your submitted appeal is now read-only unless staff request more information.");
    lock.dataset.appealLifecycle = "lock";
    card.querySelector(".appeal-history-summary")?.append(lock);
    return;
  }
  if (appeal.status === EDITABLE_STATUS && !appeal.claimed) {
    const panel = answerForm(appeal);
    card.append(panel);
  }
}

function applyAppeals(appeals) {
  const byId = new Map(appeals.map((appeal) => [String(appeal.id).toLowerCase(), appeal]));
  for (const card of historyRoot?.querySelectorAll("[data-appeal-id]") ?? []) {
    const appeal = byId.get(String(card.dataset.appealId).toLowerCase());
    if (appeal) decorateCard(card, appeal);
  }
}

async function refreshLifecycle() {
  if (!historyRoot || loading) return;
  loading = true;
  try {
    const response = await fetch("/api/appeals", {
      credentials: "same-origin",
      headers: { accept: "application/json" }
    });
    if (!response.ok) return;
    const payload = await response.json();
    applyAppeals(Array.isArray(payload.appeals) ? payload.appeals : []);
  } catch {
    // The primary appeal UI owns its normal error state.
  } finally {
    loading = false;
  }
}

function scheduleRefresh() {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(refreshLifecycle, 80);
}

if (historyRoot) {
  new MutationObserver(scheduleRefresh).observe(historyRoot, { childList: true, subtree: true });
  scheduleRefresh();
}
