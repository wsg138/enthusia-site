const API_ROOT = "/api/competitions";

function node(tag, className = "", text = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

async function jsonRequest(path, options = {}) {
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
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function waitForDetail(timeoutMs = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tabs = document.querySelector(".competition-detail-tabs");
    const content = document.querySelector(".competition-detail-content");
    if (tabs && content) return { tabs, content };
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return null;
}

function slug() {
  return new URLSearchParams(window.location.search).get("competition")?.trim().toLowerCase() ?? "";
}

function scoreValue(existing, criterionId) {
  const value = existing?.criteria?.[criterionId];
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}

function renderImages(entry, root) {
  const images = Array.isArray(entry.images) ? [...entry.images].sort((a, b) => a.sortOrder - b.sortOrder) : [];
  if (!images.length) return;
  const gallery = node("div", "judge-image-grid");
  for (const image of images) {
    const link = document.createElement("a");
    link.className = "judge-image-link";
    link.href = image.url;
    link.target = "_blank";
    link.rel = "noopener";
    const preview = document.createElement("img");
    preview.src = image.url;
    preview.alt = `${entry.title} submission screenshot`;
    preview.loading = "lazy";
    link.append(preview);
    gallery.append(link);
  }
  root.append(gallery);
}

function renderParticipants(entry, root) {
  const participants = Array.isArray(entry.participants) ? entry.participants : [];
  if (!participants.length) return;
  const wrap = node("div", "submission-members");
  for (const participant of participants) {
    wrap.append(node("span", "submission-member", `${participant.playerName} · ${participant.role}`));
  }
  root.append(wrap);
}

function renderLocation(workspace, entry, root) {
  if (!workspace.canViewCoordinates || !entry.location) return;
  const box = node("div", "judge-coordinate-box");
  box.append(
    node("strong", "", "Private judging location"),
    node("code", "", `${entry.location.worldName} · ${entry.location.x}, ${entry.location.y}, ${entry.location.z}`),
    node("span", "participant-muted", "Do not share these coordinates. Access is limited to this assigned judge workspace.")
  );
  root.append(box);
}

function renderScoreForm(workspace, entry, root) {
  const criteria = workspace.competition.config?.judging?.criteria ?? [];
  const form = document.createElement("form");
  form.className = "judge-score-form";
  form.addEventListener("submit", (event) => event.preventDefault());

  const heading = node("div", "judge-score-heading");
  heading.append(node("h4", "", "Your score"));
  if (entry.score?.computedScore !== undefined) {
    heading.append(node("span", "competition-badge", `Saved ${Number(entry.score.computedScore).toFixed(2)} / 10`));
  }
  form.append(heading);

  const scoreGrid = node("div", "judge-score-grid");
  for (const criterion of criteria) {
    const label = node("label", "participant-field");
    label.append(node("span", "participant-field-label", `${criterion.label} · weight ${criterion.weight}`));
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "10";
    input.step = "0.1";
    input.required = true;
    input.dataset.criterionId = criterion.id;
    input.value = scoreValue(entry.score, criterion.id);
    label.append(input);
    scoreGrid.append(label);
  }
  form.append(scoreGrid);

  if (workspace.competition.config?.judging?.publicFeedbackOptional) {
    const feedbackLabel = node("label", "participant-field");
    feedbackLabel.append(node("span", "participant-field-label", "Optional public feedback"));
    const feedback = document.createElement("textarea");
    feedback.name = "publicFeedback";
    feedback.rows = 4;
    feedback.maxLength = 2000;
    feedback.value = entry.score?.publicFeedback ?? "";
    feedbackLabel.append(feedback);
    form.append(feedbackLabel);
  }

  const noteLabel = node("label", "participant-field");
  noteLabel.append(node("span", "participant-field-label", "Private judge note"));
  const privateNote = document.createElement("textarea");
  privateNote.name = "privateNote";
  privateNote.rows = 3;
  privateNote.maxLength = 4000;
  privateNote.value = entry.score?.privateNote ?? "";
  noteLabel.append(privateNote, node("span", "participant-muted", "Only authorized staff can see this note."));
  form.append(noteLabel);

  const result = node("p", "participant-wizard-message");
  form.append(result);
  const save = node("button", "competition-primary-action", entry.score ? "Update score" : "Save score");
  save.type = "button";
  save.addEventListener("click", async () => {
    const scores = {};
    for (const input of form.querySelectorAll("[data-criterion-id]")) {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < 0 || value > 10) {
        result.textContent = "Every criterion needs a score from 0 to 10.";
        result.className = "participant-wizard-message is-error";
        return;
      }
      scores[input.dataset.criterionId] = value;
    }
    save.disabled = true;
    result.textContent = "Saving…";
    result.className = "participant-wizard-message";
    try {
      const payload = await jsonRequest(`${API_ROOT}/judge/${workspace.competition.id}`, {
        method: "POST",
        body: JSON.stringify({
          submissionId: entry.id,
          scores,
          bonusPoints: Number(entry.score?.bonusPoints ?? 0),
          publicFeedback: form.querySelector('[name="publicFeedback"]')?.value.trim() || null,
          privateNote: privateNote.value.trim() || null
        })
      });
      entry.score = {
        ...(entry.score ?? {}),
        criteria: scores,
        computedScore: payload.computedScore,
        baseScore: payload.baseScore,
        bonusPoints: payload.bonusPoints,
        publicFeedback: form.querySelector('[name="publicFeedback"]')?.value.trim() || null,
        privateNote: privateNote.value.trim() || null
      };
      result.textContent = `Saved · ${Number(payload.computedScore).toFixed(2)} / 10`;
      result.className = "participant-wizard-message is-success";
      save.textContent = "Update score";
    } catch (error) {
      result.textContent = error.payload?.detail || String(error.message).replaceAll("_", " ");
      result.className = "participant-wizard-message is-error";
    } finally {
      save.disabled = false;
    }
  });
  form.append(save);
  root.append(form);
}

function renderJudgePanel(workspace, panel) {
  panel.replaceChildren();
  const intro = node("div", "participant-section-heading");
  const copy = node("div");
  copy.append(node("p", "competitions-kicker", "Assigned judge workspace"), node("h2", "", workspace.competition.title));
  intro.append(copy);
  panel.append(intro);

  if (!workspace.judgingOpen) {
    panel.append(node("div", "competition-empty", `Judging is not open. Current stage: ${workspace.competition.lifecycleState}.`));
    return;
  }

  if (workspace.coordinateNotice) {
    const warning = node("div", "competition-private-warning", workspace.coordinateNotice);
    panel.append(warning);
  }

  const criteria = workspace.competition.config?.judging?.criteria ?? [];
  if (!criteria.length) {
    panel.append(node("div", "competition-error", "This competition has no configured judging criteria."));
    return;
  }

  const entries = Array.isArray(workspace.entries) ? workspace.entries : [];
  const progress = entries.filter((entry) => entry.score).length;
  panel.append(node("p", "participant-muted", `${progress} of ${entries.length} entries have a saved score. You can revise scores until judging closes.`));

  const list = node("div", "judge-entry-list");
  for (const entry of entries) {
    const card = node("article", "participant-card judge-entry-card");
    const header = node("div", "participant-section-heading");
    const title = node("div");
    title.append(
      node("span", "competition-badge", entry.entryType),
      node("h3", "", entry.title),
      node("p", "participant-muted", entry.entryType === "GUILD" && entry.guildName ? entry.guildName : `By ${entry.ownerName}`)
    );
    header.append(title);
    card.append(header, node("p", "judge-entry-description", entry.description));
    renderParticipants(entry, card);
    renderImages(entry, card);
    renderLocation(workspace, entry, card);
    renderScoreForm(workspace, entry, card);
    list.append(card);
  }
  panel.append(list);
}

function addJudgeTab(shell, workspace) {
  if (shell.tabs.querySelector('[data-tab="judge"]')) return;
  const button = node("button", "", "Judge");
  button.type = "button";
  button.dataset.tab = "judge";
  const resultsButton = shell.tabs.querySelector('[data-tab="results"]');
  if (resultsButton) shell.tabs.insertBefore(button, resultsButton);
  else shell.tabs.append(button);

  const panel = node("section", "competition-tab-panel judge-panel");
  panel.dataset.tabPanel = "judge";
  panel.hidden = true;
  shell.content.append(panel);
  renderJudgePanel(workspace, panel);

  button.addEventListener("click", () => {
    shell.tabs.querySelectorAll("[data-tab]").forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
    shell.content.querySelectorAll("[data-tab-panel]").forEach((candidate) => {
      candidate.hidden = candidate.dataset.tabPanel !== "judge";
    });
  });
}

async function initJudgeWorkspace() {
  if (document.body.dataset.competitionPage !== "detail") return;
  const competitionSlug = slug();
  if (!competitionSlug) return;
  const shell = await waitForDetail();
  if (!shell) return;

  let publicDetail;
  try {
    publicDetail = await jsonRequest(`${API_ROOT}/${encodeURIComponent(competitionSlug)}`);
  } catch {
    return;
  }

  try {
    const workspace = await jsonRequest(`${API_ROOT}/judge/${publicDetail.competition.id}`);
    addJudgeTab(shell, workspace);
  } catch (error) {
    if (error.status === 401 || error.status === 403 || error.status === 404) return;
  }
}

initJudgeWorkspace();
