const API_ROOT = "/api/competitions/admin";

const state = {
  competitions: [],
  current: null,
  publishReadiness: [],
  criteria: []
};

const elements = {
  statusMessage: document.querySelector("#serviceStatusMessage"),
  statusGrid: document.querySelector("#serviceStatusGrid"),
  refresh: document.querySelector("#refreshCompetitions"),
  createForm: document.querySelector("#createCompetitionForm"),
  createResult: document.querySelector("#createCompetitionResult"),
  list: document.querySelector("#competitionList"),
  editor: document.querySelector("#competitionEditor"),
  empty: document.querySelector("#competitionEmptyState"),
  editorTitle: document.querySelector("#editorTitle"),
  editorStateLabel: document.querySelector("#editorStateLabel"),
  editorMetadata: document.querySelector("#editorMetadata"),
  editForm: document.querySelector("#competitionEditForm"),
  save: document.querySelector("#saveCompetition"),
  reload: document.querySelector("#reloadCompetition"),
  saveResult: document.querySelector("#saveCompetitionResult"),
  changeNote: document.querySelector("#changeNote"),
  staleWarning: document.querySelector("#staleWarning"),
  readiness: document.querySelector("#publishReadiness"),
  criteriaList: document.querySelector("#criteriaList"),
  addCriterion: document.querySelector("#addCriterion"),
  judgeCoordinateWarning: document.querySelector("#judgeCoordinateWarning"),
  preview: document.querySelector("#competitionPreview"),
  previewCategory: document.querySelector("#previewCategory"),
  previewTitle: document.querySelector("#previewTitle"),
  previewSummary: document.querySelector("#previewSummary")
};

function formField(name) {
  return elements.editForm.elements.namedItem(name);
}

function setStatusMessage(message, error = false) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.style.color = error ? "var(--red)" : "";
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function statusCard(label, value, stateName) {
  const card = document.createElement("article");
  card.className = "admin-status-item";
  card.dataset.state = stateName;
  const strong = document.createElement("strong");
  strong.textContent = value;
  const span = document.createElement("span");
  span.textContent = label;
  card.append(strong, span);
  return card;
}

async function loadStatus() {
  setStatusMessage("Checking…");
  try {
    const { response, payload } = await requestJson(`${API_ROOT}/status`);
    if (!response.ok && response.status !== 503) {
      elements.statusGrid.replaceChildren();
      setStatusMessage(`Unable to read competition status (${response.status}).`, true);
      return;
    }

    const cards = [
      statusCard(
        "Environment",
        payload.environment || "unknown",
        payload.environment === "preview" ? "ready" : "warning"
      ),
      statusCard(
        "D1 competition database",
        payload.database?.schemaReady ? "Ready" : payload.database?.bound ? "Migration needed" : "Not bound",
        payload.database?.schemaReady ? "ready" : "error"
      ),
      statusCard(
        "Private R2 media",
        payload.media?.bound ? "Bound" : "Not bound",
        payload.media?.bound ? "ready" : "warning"
      ),
      statusCard(
        "OpenAI Moderation API",
        payload.moderation?.configured ? "Configured" : "Not configured",
        payload.moderation?.configured ? "ready" : "warning"
      )
    ];
    elements.statusGrid.replaceChildren(...cards);
    setStatusMessage(payload.ok ? "Core competition storage is ready." : "Development setup is incomplete.", !payload.ok);
  } catch {
    elements.statusGrid.replaceChildren();
    setStatusMessage("Unable to reach the competition API.", true);
  }
}

function competitionListButton(competition) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.competitionId = competition.id;
  if (state.current?.id === competition.id) button.classList.add("is-active");

  const title = document.createElement("strong");
  title.textContent = competition.title;
  const meta = document.createElement("span");
  meta.textContent = `${competition.lifecycleState} · ${competition.category} · v${competition.configVersion}`;
  button.append(title, meta);
  button.addEventListener("click", () => loadCompetition(competition.id));
  return button;
}

function renderCompetitionList() {
  if (!state.competitions.length) {
    const empty = document.createElement("p");
    empty.textContent = "No competition drafts yet.";
    elements.list.replaceChildren(empty);
    return;
  }
  elements.list.replaceChildren(...state.competitions.map(competitionListButton));
}

async function loadCompetitionList() {
  elements.list.textContent = "Loading…";
  try {
    const { response, payload } = await requestJson(API_ROOT);
    if (!response.ok) {
      elements.list.textContent = `Unable to load competitions (${response.status}).`;
      return;
    }
    state.competitions = Array.isArray(payload.competitions) ? payload.competitions : [];
    renderCompetitionList();
  } catch {
    elements.list.textContent = "Unable to reach the competition API.";
  }
}

function toLocalDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerOrNull(value) {
  const number = numberOrNull(value);
  return Number.isInteger(number) ? number : null;
}

function setCheckbox(name, checked) {
  const input = formField(name);
  if (input) input.checked = Boolean(checked);
}

function setValue(name, value) {
  const input = formField(name);
  if (input) input.value = value ?? "";
}

function selectedEntryTypes() {
  return [...elements.editForm.querySelectorAll('input[name="entryType"]:checked')]
    .map((input) => input.value);
}

function fillEntryTypes(types) {
  const selected = new Set(types ?? []);
  elements.editForm.querySelectorAll('input[name="entryType"]').forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function criterionId(label) {
  const base = String(label || "criterion")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  return `${base || "criterion"}-${crypto.randomUUID().slice(0, 8)}`;
}

function renderCriteria() {
  if (!state.criteria.length) {
    const empty = document.createElement("p");
    empty.className = "admin-muted";
    empty.textContent = "No judging criteria yet.";
    elements.criteriaList.replaceChildren(empty);
    return;
  }

  const rows = state.criteria.map((criterion) => {
    const row = document.createElement("div");
    row.className = "criteria-row";
    row.dataset.criterionId = criterion.id;

    const label = document.createElement("label");
    label.textContent = "Criterion";
    const labelInput = document.createElement("input");
    labelInput.value = criterion.label;
    labelInput.maxLength = 80;
    labelInput.required = true;
    labelInput.addEventListener("input", () => {
      criterion.label = labelInput.value;
    });
    label.append(labelInput);

    const weight = document.createElement("label");
    weight.textContent = "Weight";
    const weightInput = document.createElement("input");
    weightInput.type = "number";
    weightInput.min = "0.01";
    weightInput.max = "1000";
    weightInput.step = "0.01";
    weightInput.value = String(criterion.weight);
    weightInput.required = true;
    weightInput.addEventListener("input", () => {
      criterion.weight = Number(weightInput.value);
    });
    weight.append(weightInput);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button-secondary";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      state.criteria = state.criteria.filter((item) => item.id !== criterion.id);
      renderCriteria();
    });

    row.append(label, weight, remove);
    return row;
  });
  elements.criteriaList.replaceChildren(...rows);
}

function renderCoordinateWarning() {
  const requested = Boolean(formField("coordinatesRequested")?.checked);
  const judgeAccess = Boolean(formField("judgesCanViewCoordinates")?.checked);
  elements.judgeCoordinateWarning.hidden = !(requested && judgeAccess);
}

function updatePreview() {
  const title = formField("title")?.value.trim() || "Competition title";
  const category = formField("category")?.value.trim() || "Competition";
  const summary = formField("summary")?.value.trim() || "Player-facing summary preview.";
  const accent = formField("accent")?.value || "#ff8a00";
  elements.previewTitle.textContent = title;
  elements.previewCategory.textContent = category;
  elements.previewSummary.textContent = summary;
  elements.preview.style.setProperty("--competition-accent", accent);
}

function renderReadiness(errors = state.publishReadiness) {
  state.publishReadiness = Array.isArray(errors) ? errors : [];
  if (!state.publishReadiness.length) {
    const ready = document.createElement("div");
    ready.className = "readiness-item readiness-ready";
    ready.textContent = "Configuration passes the current publish-readiness checks.";
    elements.readiness.replaceChildren(ready);
    return;
  }

  elements.readiness.replaceChildren(...state.publishReadiness.map((error) => {
    const item = document.createElement("div");
    item.className = "readiness-item";
    const strong = document.createElement("strong");
    strong.textContent = error.code || "Configuration issue";
    const message = document.createElement("div");
    message.textContent = error.message || "This setting must be corrected before publishing.";
    item.append(strong, message);
    return item;
  }));
}

function fillEditor(competition, readiness) {
  state.current = competition;
  state.publishReadiness = readiness ?? [];
  state.criteria = Array.isArray(competition.config?.judging?.criteria)
    ? structuredClone(competition.config.judging.criteria)
    : [];

  const config = competition.config;
  elements.editor.hidden = false;
  elements.empty.hidden = true;
  elements.staleWarning.hidden = true;
  elements.editorTitle.textContent = competition.title;
  elements.editorStateLabel.textContent = competition.lifecycleState;
  elements.editorMetadata.textContent = `${competition.slug} · config v${competition.configVersion} · ${competition.category}`;

  setValue("title", competition.title);
  setValue("category", competition.category);
  setValue("summary", config.public?.summary ?? "");
  setValue("description", config.public?.description ?? "");
  setValue("rules", config.public?.rules ?? "");
  setValue("accent", config.appearance?.accent ?? "#ff8a00");

  for (const field of [
    "submissionsOpenAt",
    "submissionsCloseAt",
    "reviewCloseAt",
    "votingOpenAt",
    "votingCloseAt",
    "judgingOpenAt",
    "judgingCloseAt"
  ]) {
    setValue(field, toLocalDateTime(config.schedule?.[field]));
  }

  fillEntryTypes(config.entries?.allowedTypes);
  setValue("maxEntriesPerPlayer", config.entries?.maxEntriesPerPlayer);
  setValue("maxEntriesPerGuild", config.entries?.maxEntriesPerGuild);
  setValue("maxImages", config.entries?.maxImages);
  setValue("minImages", config.entries?.minImages);
  setValue("maxDescriptionChars", config.entries?.maxDescriptionChars);
  setValue("maxMainMembers", config.entries?.maxMainMembers);
  setValue("maxHelpers", config.entries?.maxHelpers);
  setValue("guildSubmissionPermission", config.entries?.guildSubmissionPermission);
  setCheckbox("coordinatesRequested", config.entries?.coordinatesRequested);
  setCheckbox("judgesCanViewCoordinates", config.entries?.judgesCanViewCoordinates);

  setCheckbox("votingEnabled", config.voting?.enabled);
  setValue("votesPerVoter", config.voting?.votesPerVoter);
  setValue("minimumActiveMinutes", config.voting?.minimumActiveMinutes);

  setCheckbox("judgingEnabled", config.judging?.enabled);
  setCheckbox("allowNonStaffJudges", config.judging?.allowNonStaffJudges);
  setValue("communityWeight", config.judging?.communityWeight);
  setValue("judgeWeight", config.judging?.judgeWeight);
  setValue("tiebreakRule", config.judging?.tiebreakRule);
  setValue("reviewGraceMinutes", config.moderation?.reviewGraceMinutes);

  elements.changeNote.value = "";
  elements.saveResult.textContent = "";
  renderCriteria();
  renderCoordinateWarning();
  updatePreview();
  renderReadiness();
  renderCompetitionList();
}

async function loadCompetition(id) {
  elements.save.disabled = true;
  elements.reload.disabled = true;
  elements.saveResult.textContent = "Loading draft…";
  try {
    const { response, payload } = await requestJson(`${API_ROOT}/${encodeURIComponent(id)}`);
    if (!response.ok) {
      elements.saveResult.textContent = `Unable to load competition (${response.status}).`;
      return;
    }
    fillEditor(payload.competition, payload.publishReadiness);
  } catch {
    elements.saveResult.textContent = "Unable to reach the competition API.";
  } finally {
    elements.save.disabled = false;
    elements.reload.disabled = false;
  }
}

function buildConfigFromEditor() {
  const current = structuredClone(state.current.config);
  current.public = {
    summary: formField("summary").value,
    description: formField("description").value,
    rules: formField("rules").value
  };
  current.appearance = {
    ...current.appearance,
    accent: formField("accent").value || null
  };
  current.schedule = {
    submissionsOpenAt: toIsoDateTime(formField("submissionsOpenAt").value),
    submissionsCloseAt: toIsoDateTime(formField("submissionsCloseAt").value),
    reviewCloseAt: toIsoDateTime(formField("reviewCloseAt").value),
    votingOpenAt: toIsoDateTime(formField("votingOpenAt").value),
    votingCloseAt: toIsoDateTime(formField("votingCloseAt").value),
    judgingOpenAt: toIsoDateTime(formField("judgingOpenAt").value),
    judgingCloseAt: toIsoDateTime(formField("judgingCloseAt").value)
  };
  current.entries = {
    ...current.entries,
    allowedTypes: selectedEntryTypes(),
    maxEntriesPerPlayer: integerOrNull(formField("maxEntriesPerPlayer").value),
    maxEntriesPerGuild: integerOrNull(formField("maxEntriesPerGuild").value),
    maxImages: integerOrNull(formField("maxImages").value),
    minImages: integerOrNull(formField("minImages").value),
    maxDescriptionChars: integerOrNull(formField("maxDescriptionChars").value),
    maxMainMembers: integerOrNull(formField("maxMainMembers").value),
    maxHelpers: integerOrNull(formField("maxHelpers").value),
    guildSubmissionPermission: formField("guildSubmissionPermission").value,
    coordinatesRequested: formField("coordinatesRequested").checked,
    judgesCanViewCoordinates: formField("judgesCanViewCoordinates").checked
  };
  current.voting = {
    ...current.voting,
    enabled: formField("votingEnabled").checked,
    votesPerVoter: integerOrNull(formField("votesPerVoter").value),
    minimumActiveMinutes: integerOrNull(formField("minimumActiveMinutes").value)
  };
  current.judging = {
    ...current.judging,
    enabled: formField("judgingEnabled").checked,
    allowNonStaffJudges: formField("allowNonStaffJudges").checked,
    criteria: state.criteria.map((criterion) => ({
      id: criterion.id,
      label: String(criterion.label || "").trim(),
      maxScore: 10,
      weight: Number(criterion.weight)
    })),
    communityWeight: numberOrNull(formField("communityWeight").value),
    judgeWeight: numberOrNull(formField("judgeWeight").value),
    tiebreakRule: formField("tiebreakRule").value || null
  };
  current.moderation = {
    ...current.moderation,
    reviewGraceMinutes: integerOrNull(formField("reviewGraceMinutes").value)
  };
  return current;
}

async function saveCurrentCompetition() {
  if (!state.current) return;
  elements.save.disabled = true;
  elements.reload.disabled = true;
  elements.staleWarning.hidden = true;
  elements.saveResult.textContent = "Saving…";

  const body = {
    expectedVersion: state.current.configVersion,
    title: formField("title").value,
    category: formField("category").value,
    config: buildConfigFromEditor(),
    changeNote: elements.changeNote.value
  };

  try {
    const { response, payload } = await requestJson(`${API_ROOT}/${encodeURIComponent(state.current.id)}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });

    if (response.status === 409) {
      elements.staleWarning.hidden = false;
      elements.saveResult.textContent = "Draft changed elsewhere. Reload before saving.";
      return;
    }
    if (!response.ok) {
      elements.saveResult.textContent = payload.error
        ? `Unable to save: ${payload.error}`
        : `Unable to save (${response.status}).`;
      return;
    }

    state.current = {
      ...state.current,
      ...payload.competition,
      config: payload.competition.config
    };
    state.publishReadiness = payload.publishReadiness ?? [];
    elements.editorTitle.textContent = state.current.title;
    elements.editorMetadata.textContent = `${state.current.slug} · config v${state.current.configVersion} · ${state.current.category}`;
    elements.changeNote.value = "";
    elements.saveResult.textContent = `Saved config v${state.current.configVersion}.`;
    renderReadiness();
    await loadCompetitionList();
  } catch {
    elements.saveResult.textContent = "Unable to reach the competition API.";
  } finally {
    elements.save.disabled = false;
    elements.reload.disabled = false;
  }
}

async function createCompetition(event) {
  event.preventDefault();
  elements.createResult.textContent = "Creating private draft…";
  const form = new FormData(elements.createForm);
  const body = {
    title: form.get("title"),
    category: form.get("category"),
    summary: form.get("summary")
  };

  try {
    const { response, payload } = await requestJson(API_ROOT, {
      method: "POST",
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      elements.createResult.textContent = payload.error
        ? `Unable to create: ${payload.error}`
        : `Unable to create (${response.status}).`;
      return;
    }
    elements.createForm.reset();
    elements.createResult.textContent = "Draft created.";
    await loadCompetitionList();
    if (payload.competition?.id) await loadCompetition(payload.competition.id);
  } catch {
    elements.createResult.textContent = "Unable to reach the competition API.";
  }
}

function setEditorSection(section) {
  document.querySelectorAll("[data-editor-section]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.editorSection === section);
  });
  document.querySelectorAll("[data-editor-panel]").forEach((panel) => {
    const active = panel.dataset.editorPanel === section;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
}

function initEditorEvents() {
  document.querySelectorAll("[data-editor-section]").forEach((button) => {
    button.addEventListener("click", () => setEditorSection(button.dataset.editorSection));
  });

  elements.addCriterion.addEventListener("click", () => {
    state.criteria.push({
      id: criterionId(`criterion-${state.criteria.length + 1}`),
      label: `Criterion ${state.criteria.length + 1}`,
      maxScore: 10,
      weight: 1
    });
    renderCriteria();
  });

  formField("coordinatesRequested").addEventListener("change", () => {
    if (!formField("coordinatesRequested").checked) {
      formField("judgesCanViewCoordinates").checked = false;
    }
    renderCoordinateWarning();
  });
  formField("judgesCanViewCoordinates").addEventListener("change", renderCoordinateWarning);

  for (const name of ["title", "category", "summary", "accent"]) {
    formField(name).addEventListener("input", updatePreview);
  }

  elements.save.addEventListener("click", saveCurrentCompetition);
  elements.reload.addEventListener("click", () => {
    if (state.current) loadCompetition(state.current.id);
  });
}

async function refreshAll() {
  elements.refresh.disabled = true;
  await Promise.all([loadStatus(), loadCompetitionList()]);
  elements.refresh.disabled = false;
}

elements.createForm.addEventListener("submit", createCompetition);
elements.refresh.addEventListener("click", refreshAll);
initEditorEvents();
await refreshAll();
