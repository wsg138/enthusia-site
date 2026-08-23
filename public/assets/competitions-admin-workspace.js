const ROOT = "/api/competitions/admin";

const workspaceState = {
  competitionId: null,
  competition: null,
  submissions: [],
  selectedSubmission: null,
  judges: [],
  standings: null,
  rewardConfig: null,
  rewardRuntime: null
};

const panels = {};
const buttons = {};

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function field(label, control, hint = "") {
  const wrapper = el("label", "admin-workspace-field");
  wrapper.append(el("span", "admin-workspace-label", label), control);
  if (hint) wrapper.append(el("small", "admin-muted", hint));
  return wrapper;
}

function textInput(value = "", maxLength = 500) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value ?? "";
  input.maxLength = maxLength;
  return input;
}

function numberInput(value = "", min = null, max = null, step = "1") {
  const input = document.createElement("input");
  input.type = "number";
  input.value = value ?? "";
  if (min !== null) input.min = String(min);
  if (max !== null) input.max = String(max);
  input.step = String(step);
  return input;
}

function selectInput(options, value = "") {
  const select = document.createElement("select");
  for (const [optionValue, label] of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = label;
    select.append(option);
  }
  select.value = value ?? "";
  return select;
}

function textarea(value = "", maxLength = 4000, rows = 4) {
  const control = document.createElement("textarea");
  control.value = value ?? "";
  control.maxLength = maxLength;
  control.rows = rows;
  return control;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function pretty(value) {
  return String(value ?? "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (match) => match.toUpperCase());
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
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function errorText(error) {
  const code = error?.payload?.error ?? error?.message ?? "unknown_error";
  const detail = error?.payload?.detail;
  return detail ? `${pretty(code)}: ${detail}` : pretty(code);
}

function activeCompetitionId() {
  return document.querySelector("#competitionList button.is-active")?.dataset?.competitionId ?? null;
}

function activate(name) {
  Object.entries(buttons).forEach(([key, button]) => button.classList.toggle("is-active", key === name));
  Object.entries(panels).forEach(([key, panel]) => {
    panel.hidden = key !== name;
    panel.classList.toggle("is-active", key === name);
  });
  if (!workspaceState.competitionId) return;
  if (name === "review") loadReviewQueue();
  if (name === "judges") loadJudges();
  if (name === "results") loadResults();
  if (name === "rewards") loadRewards();
}

function addWorkspacePanel(name, label, eyebrow, title) {
  const nav = document.querySelector(".competition-editor-nav");
  const content = document.querySelector(".competition-editor-content");
  if (!nav || !content) return;

  const button = el("button", "", label);
  button.type = "button";
  button.dataset.workspaceSection = name;
  button.addEventListener("click", () => activate(name));
  nav.append(button);
  buttons[name] = button;

  const panel = el("section", "editor-section admin-workspace-panel");
  panel.dataset.workspacePanel = name;
  panel.hidden = true;
  const heading = el("div", "editor-section-heading");
  const copy = el("div");
  copy.append(el("p", "admin-eyebrow", eyebrow), el("h3", "", title));
  heading.append(copy);
  const body = el("div", "admin-workspace-body");
  panel.append(heading, body);
  content.append(panel);
  panels[name] = panel;
}

function initWorkspace() {
  if (document.querySelector("[data-workspace-section]")) return;
  addWorkspacePanel("review", "Review queue", "Moderation", "Submission review queue");
  addWorkspacePanel("judges", "Judges", "Judging", "Judge assignments");
  addWorkspacePanel("results", "Standings & results", "Results", "Scoring, ties & publication");
  addWorkspacePanel("rewards", "Rewards", "Rewards", "Reward configuration & delivery");
  observeSelection();
  suppressGenericResultPublish();
}

function panelBody(name) {
  return panels[name]?.querySelector(".admin-workspace-body") ?? null;
}

function setLoading(name, message = "Loading…") {
  const body = panelBody(name);
  if (body) body.replaceChildren(el("div", "admin-static-field", message));
}

async function loadCompetitionSnapshot(id) {
  const payload = await api(`${ROOT}/${encodeURIComponent(id)}`);
  workspaceState.competition = payload.competition;
  return payload.competition;
}

async function syncSelection() {
  const id = activeCompetitionId();
  if (!id || id === workspaceState.competitionId) return;
  workspaceState.competitionId = id;
  workspaceState.competition = null;
  workspaceState.submissions = [];
  workspaceState.selectedSubmission = null;
  workspaceState.judges = [];
  workspaceState.standings = null;
  workspaceState.rewardConfig = null;
  workspaceState.rewardRuntime = null;
  try {
    await loadCompetitionSnapshot(id);
  } catch {
    // The main admin editor owns the primary load error UI.
  }
  const activeWorkspace = Object.entries(buttons).find(([, button]) => button.classList.contains("is-active"))?.[0];
  if (activeWorkspace) activate(activeWorkspace);
  suppressGenericResultPublish();
}

function observeSelection() {
  const list = document.querySelector("#competitionList");
  const lifecycle = document.querySelector("#lifecycleActions");
  if (list) new MutationObserver(syncSelection).observe(list, { subtree: true, attributes: true, childList: true, attributeFilter: ["class"] });
  if (lifecycle) new MutationObserver(suppressGenericResultPublish).observe(lifecycle, { subtree: true, childList: true });
  document.addEventListener("click", (event) => {
    const selected = event.target.closest?.("#competitionList button[data-competition-id]");
    if (selected) setTimeout(syncSelection, 0);
  }, true);
  setTimeout(syncSelection, 0);
}

function suppressGenericResultPublish() {
  const generic = document.querySelector('#lifecycleActions button[data-target-state="COMPLETED"]');
  if (generic) generic.hidden = true;
  const actions = document.querySelector("#lifecycleActions");
  if (actions && workspaceState.competition?.lifecycleState === "RESULTS_READY" && !actions.querySelector("[data-results-publish-note]")) {
    const note = el("div", "admin-inline-alert admin-info", "Final results can only be published from Standings & results after the provisional result set is reviewed.");
    note.dataset.resultsPublishNote = "true";
    actions.prepend(note);
  }
}

function queueCard(submission) {
  const card = el("button", "staff-submission-card");
  card.type = "button";
  card.dataset.status = submission.status;
  const top = el("div", "staff-submission-card-top");
  top.append(el("strong", "", submission.title), el("span", "competition-badge", pretty(submission.status)));
  const owner = submission.entryType === "GUILD" && submission.guildName
    ? `${submission.guildName} · managed by ${submission.ownerName}`
    : submission.ownerName;
  card.append(
    top,
    el("span", "admin-muted", `${submission.entryType} · ${owner}`),
    el("span", "admin-muted", `${submission.imageCount} images · ${submission.acceptedParticipantCount} accepted people`)
  );
  if (submission.publicReason) card.append(el("span", "staff-submission-reason", submission.publicReason));
  card.addEventListener("click", () => loadSubmissionDetail(submission.id));
  return card;
}

async function loadReviewQueue() {
  const id = workspaceState.competitionId;
  if (!id) return;
  setLoading("review", "Loading submission queue…");
  try {
    const payload = await api(`${ROOT}/${encodeURIComponent(id)}/submissions`);
    workspaceState.submissions = Array.isArray(payload.submissions) ? payload.submissions : [];
    const body = panelBody("review");
    const toolbar = el("div", "admin-workspace-toolbar");
    const counts = new Map();
    workspaceState.submissions.forEach((submission) => counts.set(submission.status, (counts.get(submission.status) ?? 0) + 1));
    toolbar.append(el("span", "admin-muted", `${workspaceState.submissions.length} total · ${counts.get("PENDING_REVIEW") ?? 0} pending review`));
    const refresh = el("button", "button-secondary", "Refresh");
    refresh.type = "button";
    refresh.addEventListener("click", loadReviewQueue);
    toolbar.append(refresh);
    const layout = el("div", "staff-review-layout");
    const list = el("div", "staff-submission-list");
    if (!workspaceState.submissions.length) list.append(el("div", "admin-static-field", "No submissions yet."));
    else workspaceState.submissions.forEach((submission) => list.append(queueCard(submission)));
    const detail = el("div", "staff-submission-detail");
    detail.id = "staffSubmissionDetail";
    detail.append(el("div", "admin-static-field", "Select a submission to review it."));
    layout.append(list, detail);
    body.replaceChildren(toolbar, layout);
  } catch (error) {
    panelBody("review")?.replaceChildren(el("div", "admin-inline-alert admin-danger", errorText(error)));
  }
}

function participantChips(participants) {
  const wrap = el("div", "staff-participant-chips");
  for (const participant of participants ?? []) {
    wrap.append(el("span", "submission-member", `${participant.playerName} · ${pretty(participant.role)} · ${pretty(participant.inviteStatus)}`));
  }
  return wrap;
}

function moderationChecks(checks) {
  const wrap = el("div", "staff-moderation-checks");
  if (!checks?.length) {
    wrap.append(el("span", "admin-muted", "No automated moderation checks recorded."));
    return wrap;
  }
  for (const check of checks) {
    const row = el("div", "staff-moderation-check");
    row.append(
      el("strong", "", `${pretty(check.targetType)} · ${pretty(check.outcome)}`),
      el("span", "admin-muted", `${check.provider} / ${check.model} · ${formatDate(check.checkedAt)}`)
    );
    wrap.append(row);
  }
  return wrap;
}

async function postSubmissionAction(detail, body) {
  const id = workspaceState.competitionId;
  const submissionId = detail.submission.id;
  return api(`${ROOT}/${encodeURIComponent(id)}/submissions/${encodeURIComponent(submissionId)}`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

function moderationActionButton(detail, action, label, danger = false) {
  const button = el("button", danger ? "admin-danger-button" : "button-secondary", label);
  button.type = "button";
  button.addEventListener("click", async () => {
    let publicReason = null;
    if (action !== "APPROVE") {
      publicReason = window.prompt(`${label}: enter the player-visible reason.`)?.trim() ?? "";
      if (!publicReason) return;
    }
    const privateNote = window.prompt("Optional private staff note (not shown to the player).", "")?.trim() || null;
    button.disabled = true;
    try {
      await postSubmissionAction(detail, { action, publicReason, privateNote });
      await loadReviewQueue();
      await loadSubmissionDetail(detail.submission.id).catch(() => {});
    } catch (error) {
      window.alert(errorText(error));
      button.disabled = false;
    }
  });
  return button;
}

function renderStaffImages(detail, root) {
  const images = detail.images ?? [];
  const grid = el("div", "staff-image-grid");
  if (!images.length) {
    grid.append(el("div", "admin-static-field", "No active images."));
    root.append(grid);
    return;
  }
  images.forEach((image, index) => {
    const card = el("article", "staff-image-card");
    const link = document.createElement("a");
    link.href = image.previewUrl;
    link.target = "_blank";
    link.rel = "noopener";
    const preview = document.createElement("img");
    preview.src = image.previewUrl;
    preview.alt = `Submission image ${index + 1}`;
    preview.loading = "lazy";
    link.append(preview);
    const meta = el("div", "staff-image-meta");
    meta.append(el("span", "admin-muted", `${image.width}×${image.height} · ${Math.round(image.byteSize / 1024)} KiB`));
    const remove = el("button", "admin-danger-button", "Remove image");
    remove.type = "button";
    remove.addEventListener("click", async () => {
      const note = window.prompt("Private reason for removing this image. This is recorded in the audit log.")?.trim() ?? "";
      if (!note) return;
      remove.disabled = true;
      try {
        await api(`${ROOT}/${workspaceState.competitionId}/submissions/${detail.submission.id}/images/${image.id}`, {
          method: "DELETE",
          body: JSON.stringify({ expectedRevision: detail.submission.revision, privateNote: note })
        });
        await loadSubmissionDetail(detail.submission.id);
        await loadReviewQueue();
      } catch (error) {
        window.alert(errorText(error));
        remove.disabled = false;
      }
    });
    meta.append(remove);
    card.append(link, meta);
    grid.append(card);
  });
  root.append(grid);
}

function renderStaffEdit(detail, root) {
  const edit = el("details", "staff-edit-details");
  edit.append(el("summary", "", "Admin edit title/description"));
  const form = el("div", "staff-edit-form");
  const title = textInput(detail.submission.title, 100);
  const description = textarea(detail.submission.description, 10000, 8);
  const note = textarea("", 4000, 3);
  const save = el("button", "button-secondary", "Save staff edit");
  save.type = "button";
  save.addEventListener("click", async () => {
    if (!title.value.trim() || !description.value.trim() || !note.value.trim()) {
      window.alert("Title, description, and a private edit reason are required.");
      return;
    }
    save.disabled = true;
    try {
      await postSubmissionAction(detail, {
        action: "EDIT",
        expectedRevision: detail.submission.revision,
        title: title.value.trim(),
        description: description.value.trim(),
        privateNote: note.value.trim()
      });
      await loadSubmissionDetail(detail.submission.id);
      await loadReviewQueue();
    } catch (error) {
      window.alert(errorText(error));
      save.disabled = false;
    }
  });
  form.append(field("Title", title), field("Description", description), field("Private edit reason", note), save);
  edit.append(form);
  root.append(edit);
}

async function loadSubmissionDetail(submissionId) {
  const target = document.querySelector("#staffSubmissionDetail");
  if (!target || !workspaceState.competitionId) return;
  target.replaceChildren(el("div", "admin-static-field", "Loading submission…"));
  try {
    const detail = await api(`${ROOT}/${workspaceState.competitionId}/submissions/${encodeURIComponent(submissionId)}`);
    workspaceState.selectedSubmission = detail;
    const submission = detail.submission;
    const header = el("div", "staff-detail-heading");
    const copy = el("div");
    copy.append(el("span", "competition-badge", pretty(submission.status)), el("h3", "", submission.title));
    copy.append(el("p", "admin-muted", `${submission.entryType} · ${submission.ownerName}${submission.guildName ? ` · ${submission.guildName}` : ""}`));
    header.append(copy);
    target.replaceChildren(header);

    const description = el("div", "staff-entry-description");
    description.append(el("strong", "", "Description"), el("p", "", submission.description));
    target.append(description, participantChips(detail.participants));

    if (detail.location) {
      const loc = el("div", "admin-inline-alert admin-warning");
      loc.append(
        el("strong", "", "Private coordinates"),
        el("code", "", `${detail.location.worldName} · ${detail.location.x}, ${detail.location.y}, ${detail.location.z}`),
        el("span", "", "Never paste this into public reasons, comments, or screenshots.")
      );
      target.append(loc);
    }

    renderStaffImages(detail, target);
    target.append(el("h4", "", "Automated safety checks"), moderationChecks(detail.moderationChecks));

    if (submission.publicReason || submission.privateNote) {
      const notes = el("div", "staff-review-notes");
      if (submission.publicReason) notes.append(el("p", "", `Public reason: ${submission.publicReason}`));
      if (submission.privateNote) notes.append(el("p", "admin-muted", `Private note: ${submission.privateNote}`));
      target.append(notes);
    }

    const actions = el("div", "staff-review-actions");
    if (submission.status === "PENDING_REVIEW") {
      actions.append(
        moderationActionButton(detail, "APPROVE", "Approve"),
        moderationActionButton(detail, "NEEDS_CHANGES", "Needs changes"),
        moderationActionButton(detail, "REJECT", "Reject", true)
      );
    }
    if (["PENDING_REVIEW", "NEEDS_CHANGES", "APPROVED"].includes(submission.status)) {
      actions.append(moderationActionButton(detail, "DISQUALIFY", "Disqualify", true));
    }
    if (submission.status !== "REMOVED") {
      const remove = el("button", "admin-danger-button", "Remove entire entry");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        const privateNote = window.prompt("Private reason for completely removing this entry.")?.trim() ?? "";
        if (!privateNote) return;
        try {
          await postSubmissionAction(detail, { action: "REMOVE", privateNote });
          await loadReviewQueue();
        } catch (error) { window.alert(errorText(error)); }
      });
      actions.append(remove);
    } else {
      const restore = el("button", "button-secondary", "Restore entry");
      restore.type = "button";
      restore.addEventListener("click", async () => {
        try {
          await postSubmissionAction(detail, { action: "RESTORE", privateNote: "Restored from staff review workspace" });
          await loadReviewQueue();
          await loadSubmissionDetail(submissionId);
        } catch (error) { window.alert(errorText(error)); }
      });
      actions.append(restore);
    }
    target.append(actions);
    renderStaffEdit(detail, target);
  } catch (error) {
    target.replaceChildren(el("div", "admin-inline-alert admin-danger", errorText(error)));
  }
}

async function loadJudges() {
  const id = workspaceState.competitionId;
  if (!id) return;
  setLoading("judges", "Loading judge roster…");
  try {
    const payload = await api(`${ROOT}/${id}/judges`);
    workspaceState.judges = payload.judges ?? [];
    const body = panelBody("judges");
    const intro = el("div", "admin-inline-alert admin-info", "Judges get only the dedicated Judge tab. They cannot cast a community ballot. Exact coordinates are available only when this competition was explicitly configured to allow judge location access.");
    const assign = el("div", "judge-admin-assign");
    const name = textInput("", 16);
    name.placeholder = "Minecraft username";
    const add = el("button", "button-secondary", "Assign judge");
    add.type = "button";
    const result = el("span", "admin-form-result");
    add.addEventListener("click", async () => {
      if (!/^[A-Za-z0-9_]{1,16}$/.test(name.value.trim())) {
        result.textContent = "Enter a valid Minecraft username.";
        return;
      }
      add.disabled = true;
      result.textContent = "Resolving player and assigning…";
      try {
        await api(`${ROOT}/${id}/judges`, {
          method: "POST",
          body: JSON.stringify({ action: "ASSIGN", minecraftName: name.value.trim() })
        });
        name.value = "";
        await loadJudges();
      } catch (error) {
        result.textContent = errorText(error);
        add.disabled = false;
      }
    });
    assign.append(field("Minecraft username", name), add, result);

    const list = el("div", "judge-admin-list");
    const active = workspaceState.judges.filter((judge) => !judge.removedAt);
    if (!active.length) list.append(el("div", "admin-static-field", "No active judges assigned."));
    for (const judge of workspaceState.judges) {
      const row = el("article", "judge-admin-row");
      const copy = el("div");
      copy.append(
        el("strong", "", judge.judgeName),
        el("span", "admin-muted", `${judge.judgeUuid} · ${judge.canViewCoordinates ? "private location access" : "no coordinate access"}${judge.removedAt ? ` · removed ${formatDate(judge.removedAt)}` : ""}`)
      );
      row.append(copy);
      if (!judge.removedAt) {
        const remove = el("button", "admin-danger-button", "Remove");
        remove.type = "button";
        remove.addEventListener("click", async () => {
          remove.disabled = true;
          try {
            await api(`${ROOT}/${id}/judges`, {
              method: "POST",
              body: JSON.stringify({ action: "REMOVE", judgeUuid: judge.judgeUuid })
            });
            await loadJudges();
          } catch (error) {
            window.alert(errorText(error));
            remove.disabled = false;
          }
        });
        row.append(remove);
      }
      list.append(row);
    }
    body.replaceChildren(intro, assign, list);
  } catch (error) {
    panelBody("judges")?.replaceChildren(el("div", "admin-inline-alert admin-danger", errorText(error)));
  }
}

function standingsTable(computed) {
  const wrap = el("div", "standings-admin-wrap");
  const table = document.createElement("table");
  table.className = "standings-admin-table";
  table.innerHTML = "<thead><tr><th>Place</th><th>Entry</th><th>Final</th><th>Community</th><th>Votes</th><th>Judges</th></tr></thead>";
  const tbody = document.createElement("tbody");
  for (const standing of computed?.standings ?? []) {
    const row = document.createElement("tr");
    for (const value of [
      standing.placement,
      standing.title,
      Number(standing.finalScore).toFixed(3),
      standing.communityComponent === null ? "—" : Number(standing.communityComponent).toFixed(3),
      `${standing.voteCount ?? 0}/${standing.ballotCount ?? 0}`,
      standing.judgeComponent === null ? "—" : `${Number(standing.judgeComponent).toFixed(3)} (${standing.judgeScoreCount})`
    ]) row.append(el("td", "", String(value)));
    tbody.append(row);
  }
  table.append(tbody);
  wrap.append(table);
  return wrap;
}

function tieResolutionEditor(payload, container) {
  const groups = payload.computed?.unresolvedTies ?? [];
  if (!groups.length) return null;
  const titleById = new Map((payload.computed?.standings ?? []).map((standing) => [standing.submissionId, standing.title]));
  const section = el("div", "tie-resolution-box");
  section.append(el("strong", "", "Tie resolution required"), el("p", "admin-muted", "Assign a unique order within each tied group. The final result snapshot records that the configured tiebreak was resolved."));
  const inputs = new Map();
  groups.forEach((group, groupIndex) => {
    const groupBox = el("div", "tie-resolution-group");
    groupBox.append(el("span", "admin-workspace-label", `Tie group ${groupIndex + 1}`));
    group.forEach((submissionId, index) => {
      const order = numberInput(index + 1, 1, group.length);
      inputs.set(submissionId, order);
      groupBox.append(field(titleById.get(submissionId) ?? submissionId, order));
    });
    section.append(groupBox);
  });
  const save = el("button", "button-secondary", "Resolve ties & save provisional standings");
  save.type = "button";
  const message = el("span", "admin-form-result");
  save.addEventListener("click", async () => {
    const tieOrder = {};
    for (const [submissionId, input] of inputs) tieOrder[submissionId] = Number(input.value);
    save.disabled = true;
    message.textContent = "Saving…";
    try {
      await api(`${ROOT}/${workspaceState.competitionId}/standings`, {
        method: "POST",
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), tieOrder })
      });
      await loadResults();
    } catch (error) {
      message.textContent = errorText(error);
      save.disabled = false;
    }
  });
  section.append(save, message);
  container.append(section);
  return section;
}

async function loadResults() {
  const id = workspaceState.competitionId;
  if (!id) return;
  setLoading("results", "Computing staff standings…");
  try {
    const payload = await api(`${ROOT}/${id}/standings`);
    workspaceState.standings = payload;
    workspaceState.competition = await loadCompetitionSnapshot(id);
    const body = panelBody("results");
    const stateLine = el("div", "admin-workspace-toolbar");
    stateLine.append(el("span", "competition-badge", workspaceState.competition.lifecycleState));
    const refresh = el("button", "button-secondary", "Refresh scores");
    refresh.type = "button";
    refresh.addEventListener("click", loadResults);
    stateLine.append(refresh);
    body.replaceChildren(stateLine);

    if (payload.computed?.errors?.length) {
      const errors = el("div", "admin-inline-alert admin-warning");
      errors.append(el("strong", "", "Scoring is not complete"));
      const list = document.createElement("ul");
      payload.computed.errors.forEach((error) => list.append(el("li", "", pretty(error))));
      errors.append(list);
      body.append(errors);
    }
    if (payload.computed?.standings?.length) body.append(standingsTable(payload.computed));

    if (workspaceState.competition.lifecycleState === "RESULTS_READY") {
      if (payload.computed?.unresolvedTies?.length) {
        tieResolutionEditor(payload, body);
      } else if (payload.computed?.ready) {
        const saveBox = el("div", "result-action-box");
        saveBox.append(el("strong", "", "Provisional standings are ready"), el("p", "admin-muted", "Save this exact calculated set before final publication. This snapshots the formula version, config version, vote evidence, judge evidence, and tiebreak state."));
        const save = el("button", "button-secondary", payload.saved?.length ? "Recalculate & replace provisional set" : "Save provisional standings");
        save.type = "button";
        const message = el("span", "admin-form-result");
        save.addEventListener("click", async () => {
          save.disabled = true;
          message.textContent = "Saving…";
          try {
            await api(`${ROOT}/${id}/standings`, {
              method: "POST",
              body: JSON.stringify({ idempotencyKey: crypto.randomUUID() })
            });
            await loadResults();
          } catch (error) {
            message.textContent = errorText(error);
            save.disabled = false;
          }
        });
        saveBox.append(save, message);
        body.append(saveBox);
      }

      const results = await api(`${ROOT}/${id}/results`).catch(() => null);
      if (results?.results?.length) {
        const publish = el("div", "result-publish-box");
        publish.append(
          el("strong", "", "Publish final results"),
          el("p", "admin-muted", `Saved provisional set contains ${results.results.length} placements. Publication is explicit and cannot happen from the generic Lifecycle tab.`)
        );
        if (!results.publicationReadiness?.ready) {
          publish.append(el("div", "admin-inline-alert admin-warning", `Not ready: ${(results.publicationReadiness?.errors ?? []).map(pretty).join(", ")}`));
        } else {
          const button = el("button", "admin-danger-button", "Publish Results");
          button.type = "button";
          button.addEventListener("click", async () => {
            if (!window.confirm("Publish these final competition results? Winners and placements become permanent public history.")) return;
            button.disabled = true;
            try {
              await api(`${ROOT}/${id}/results/publish`, {
                method: "POST",
                body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), note: "Final results published from staff results workspace" })
              });
              await loadResults();
              document.querySelector("#reloadCompetition")?.click();
            } catch (error) {
              window.alert(errorText(error));
              button.disabled = false;
            }
          });
          publish.append(button);
        }
        body.append(publish);
      }
    } else if (["COMPLETED", "ARCHIVED"].includes(workspaceState.competition.lifecycleState)) {
      body.append(el("div", "admin-inline-alert admin-info", "Final results are published. Reward delivery is managed from the Rewards tab."));
    } else {
      body.append(el("div", "admin-static-field", "Live staff-only scoring is shown here. Saving provisional standings becomes available only after the lifecycle reaches Results Ready."));
    }
  } catch (error) {
    panelBody("results")?.replaceChildren(el("div", "admin-inline-alert admin-danger", errorText(error)));
  }
}

const REWARD_TYPES = ["MONEY", "ITEM", "PERMISSION", "RANK", "LORE_ITEM", "COMMAND", "MANUAL"];
const DISTRIBUTIONS = [
  ["SPLIT_ELIGIBLE", "Split among eligible main recipients"],
  ["EACH_ELIGIBLE", "Give full reward to every eligible recipient"],
  ["OWNER_ONLY", "Owner / managing player only"],
  ["RANDOM_ELIGIBLE", "Random eligible recipient(s)"],
  ["ALL_GUILD_MEMBERS", "Every guild member"],
  ["RANDOM_GUILD_MEMBERS", "Random guild member(s)"],
  ["MANUAL", "Manual delivery" ]
];

function defaultDistribution(type) {
  return type === "MONEY" || type === "ITEM" ? "SPLIT_ELIGIBLE" : type === "MANUAL" ? "MANUAL" : "OWNER_ONLY";
}

function rewardId() {
  return `reward-${crypto.randomUUID().slice(0, 12)}`;
}

function newReward() {
  return {
    id: rewardId(),
    placement: 1,
    rewardType: "MONEY",
    distributionMode: "SPLIT_ELIGIBLE",
    randomCount: null,
    includeHelpers: false,
    helperWeight: 0,
    publicLabel: "Prize",
    publicDescription: "Competition placement reward",
    payload: { amount: 1000, currency: "balance" }
  };
}

function rewardPayloadEditor(reward, container) {
  container.replaceChildren();
  const payload = reward.payload ?? {};
  const bindText = (label, key, value, max = 500) => {
    const control = textInput(value, max);
    control.addEventListener("input", () => { reward.payload[key] = control.value.trim(); });
    container.append(field(label, control));
  };
  const bindInteger = (label, key, value, min = 0, max = 9000000000000000) => {
    const control = numberInput(value, min, max);
    control.addEventListener("input", () => { reward.payload[key] = Number(control.value); });
    container.append(field(label, control));
  };

  if (reward.rewardType === "MONEY") {
    reward.payload = { amount: Number(payload.amount ?? 1000), currency: payload.currency ?? "balance" };
    bindInteger("Amount", "amount", reward.payload.amount);
    bindText("Currency key", "currency", reward.payload.currency, 48);
  } else if (["ITEM", "LORE_ITEM"].includes(reward.rewardType)) {
    reward.payload = { itemKey: payload.itemKey ?? "", amount: Number(payload.amount ?? 1) };
    bindText(reward.rewardType === "LORE_ITEM" ? "Lore item definition key" : "Item key", "itemKey", reward.payload.itemKey, 160);
    bindInteger("Amount", "amount", reward.payload.amount, 1, 2304);
  } else if (reward.rewardType === "PERMISSION") {
    reward.payload = { permission: payload.permission ?? "", durationMinutes: payload.durationMinutes ?? null };
    bindText("Permission node", "permission", reward.payload.permission, 160);
    const duration = numberInput(reward.payload.durationMinutes ?? "", 1, 5256000);
    duration.placeholder = "Blank = permanent";
    duration.addEventListener("input", () => { reward.payload.durationMinutes = duration.value ? Number(duration.value) : null; });
    container.append(field("Duration minutes", duration, "Leave blank for permanent."));
  } else if (reward.rewardType === "RANK") {
    reward.payload = { rank: payload.rank ?? "", durationMinutes: payload.durationMinutes ?? null };
    bindText("Rank / Tebex package key", "rank", reward.payload.rank, 96);
    const duration = numberInput(reward.payload.durationMinutes ?? "", 1, 5256000);
    duration.placeholder = "Blank = permanent";
    duration.addEventListener("input", () => { reward.payload.durationMinutes = duration.value ? Number(duration.value) : null; });
    container.append(field("Duration minutes", duration, "Leave blank for permanent; the bridge decides whether this maps to Tebex or the permission provider."));
  } else if (reward.rewardType === "COMMAND") {
    reward.payload = { command: payload.command ?? "" };
    bindText("Server command", "command", reward.payload.command, 500);
  } else if (reward.rewardType === "MANUAL") {
    reward.payload = { instructions: payload.instructions ?? "" };
    const control = textarea(reward.payload.instructions, 1000, 4);
    control.addEventListener("input", () => { reward.payload.instructions = control.value.trim(); });
    container.append(field("Manual instructions", control));
  }
}

function rewardEditorCard(reward, definitions) {
  const card = el("article", "reward-editor-card");
  const header = el("div", "reward-editor-heading");
  header.append(el("strong", "", reward.publicLabel || "Reward"));
  const remove = el("button", "admin-danger-button", "Remove reward");
  remove.type = "button";
  remove.addEventListener("click", () => {
    const index = definitions.indexOf(reward);
    if (index >= 0) definitions.splice(index, 1);
    renderDraftRewards();
  });
  header.append(remove);
  card.append(header);

  const grid = el("div", "reward-editor-grid");
  const placement = numberInput(reward.placement, 1, 100);
  placement.addEventListener("input", () => { reward.placement = Number(placement.value); });
  const type = selectInput(REWARD_TYPES.map((value) => [value, pretty(value)]), reward.rewardType);
  const distribution = selectInput(DISTRIBUTIONS, reward.distributionMode);
  const label = textInput(reward.publicLabel, 100);
  const description = textarea(reward.publicDescription, 500, 3);
  grid.append(field("Placement", placement), field("Reward type", type), field("Allocation", distribution), field("Public label", label), field("Public description", description));
  card.append(grid);

  label.addEventListener("input", () => { reward.publicLabel = label.value; header.querySelector("strong").textContent = label.value || "Reward"; });
  description.addEventListener("input", () => { reward.publicDescription = description.value; });
  distribution.addEventListener("change", () => {
    reward.distributionMode = distribution.value;
    reward.randomCount = ["RANDOM_ELIGIBLE", "RANDOM_GUILD_MEMBERS"].includes(distribution.value) ? (reward.randomCount ?? 1) : null;
    renderDraftRewards();
  });

  const policy = el("div", "reward-policy-row");
  const includeLabel = el("label", "admin-check");
  const include = document.createElement("input");
  include.type = "checkbox";
  include.checked = Boolean(reward.includeHelpers);
  includeLabel.append(include, el("span", "", "Include helpers/contributors in this reward"));
  const helperWeight = numberInput(reward.includeHelpers ? (reward.helperWeight || 0.5) : 0.5, 0.01, 1, "0.05");
  helperWeight.disabled = !include.checked;
  include.addEventListener("change", () => {
    reward.includeHelpers = include.checked;
    reward.helperWeight = include.checked ? Number(helperWeight.value || 0.5) : 0;
    helperWeight.disabled = !include.checked;
  });
  helperWeight.addEventListener("input", () => { if (include.checked) reward.helperWeight = Number(helperWeight.value); });
  policy.append(includeLabel, field("Helper split weight", helperWeight, "1 = same share as main member; 0.5 = half share. Helpers receive nothing unless this box is enabled."));
  card.append(policy);

  if (["RANDOM_ELIGIBLE", "RANDOM_GUILD_MEMBERS"].includes(reward.distributionMode)) {
    const random = numberInput(reward.randomCount ?? 1, 1, 100);
    random.addEventListener("input", () => { reward.randomCount = Number(random.value); });
    card.append(field("Random recipient count", random));
  }

  const payload = el("div", "reward-payload-editor");
  card.append(payload);
  type.addEventListener("change", () => {
    reward.rewardType = type.value;
    reward.distributionMode = defaultDistribution(type.value);
    reward.includeHelpers = false;
    reward.helperWeight = 0;
    reward.randomCount = null;
    reward.payload = {};
    renderDraftRewards();
  });
  rewardPayloadEditor(reward, payload);
  return card;
}

function renderDraftRewards() {
  const body = panelBody("rewards");
  if (!body || !workspaceState.rewardConfig) return;
  const definitions = workspaceState.rewardConfig.rewards.definitions;
  const toolbar = el("div", "admin-workspace-toolbar");
  toolbar.append(el("span", "admin-muted", `${definitions.length} configured reward${definitions.length === 1 ? "" : "s"}`));
  const add = el("button", "button-secondary", "Add reward");
  add.type = "button";
  add.addEventListener("click", () => { definitions.push(newReward()); renderDraftRewards(); });
  toolbar.append(add);
  const intro = el("div", "admin-inline-alert admin-info", "Rewards are frozen when the competition is first published as Upcoming. Divisible money/item rewards default to a split. Helpers receive nothing unless a specific reward explicitly includes them.");
  const list = el("div", "reward-editor-list");
  definitions.forEach((reward) => list.append(rewardEditorCard(reward, definitions)));
  if (!definitions.length) list.append(el("div", "admin-static-field", "No placement rewards configured."));
  const footer = el("div", "reward-editor-save");
  const note = textInput("", 500);
  note.placeholder = "Optional change note";
  const result = el("span", "admin-form-result");
  const save = el("button", "competition-primary-action", "Save rewards");
  save.type = "button";
  save.addEventListener("click", async () => {
    save.disabled = true;
    result.textContent = "Saving reward config…";
    try {
      const payload = await api(`${ROOT}/${workspaceState.competitionId}/reward-config`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: workspaceState.rewardConfig.configVersion,
          rewards: workspaceState.rewardConfig.rewards,
          changeNote: note.value.trim()
        })
      });
      workspaceState.rewardConfig.configVersion = payload.configVersion;
      result.textContent = `Saved in config v${payload.configVersion}. Reloading the main editor so all sections use the same version…`;
      document.querySelector("#reloadCompetition")?.click();
      await loadRewards();
    } catch (error) {
      result.textContent = errorText(error);
      save.disabled = false;
    }
  });
  footer.append(field("Save note", note), save, result);
  body.replaceChildren(toolbar, intro, list, footer);
}

function rewardSummary(definition) {
  const card = el("article", "reward-runtime-card");
  card.append(el("strong", "", `${definition.placement}. ${definition.publicLabel}`));
  card.append(el("span", "admin-muted", `${pretty(definition.rewardType)} · ${pretty(definition.distributionMode)}${definition.includeHelpers ? ` · helpers weight ${definition.helperWeight}` : " · helpers excluded"}`));
  card.append(el("p", "", definition.publicDescription));
  return card;
}

function renderRuntimeRewards(configPayload, runtime) {
  const body = panelBody("rewards");
  const definitions = configPayload.rewards?.definitions ?? [];
  const configSection = el("div", "reward-runtime-config");
  configSection.append(el("h4", "", "Frozen competition rewards"));
  if (!definitions.length) configSection.append(el("div", "admin-static-field", "This competition has no placement rewards."));
  definitions.forEach((definition) => configSection.append(rewardSummary(definition)));

  if (!["COMPLETED", "ARCHIVED"].includes(configPayload.lifecycleState)) {
    body.replaceChildren(configSection, el("div", "admin-static-field", "Reward planning and delivery become available only after final results are published."));
    return;
  }

  const runtimeSection = el("div", "reward-delivery-section");
  runtimeSection.append(el("h4", "", "Reward plan & delivery ledger"));
  if (runtime.planningError) runtimeSection.append(el("div", "admin-inline-alert admin-danger", runtime.planningError));
  if (runtime.plan) {
    const preview = el("div", "reward-plan-preview");
    runtime.plan.deliveries.forEach((delivery) => {
      preview.append(el("div", "reward-plan-row", `${delivery.publicLabel || pretty(delivery.rewardType)} → ${delivery.recipientUuid || "manual/none"}${delivery.amount !== null && delivery.amount !== undefined ? ` · ${delivery.amount}` : ""}${delivery.skippedReason ? ` · skipped: ${delivery.skippedReason}` : ""}`));
    });
    runtimeSection.append(preview);
  }

  if (configPayload.lifecycleState === "COMPLETED" && runtime.plan?.ready && !(runtime.deliveries?.length)) {
    const confirm = el("button", "admin-danger-button", "Confirm reward plan");
    confirm.type = "button";
    confirm.addEventListener("click", async () => {
      if (!window.confirm("Confirm this exact reward plan? Duplicate operation keys prevent accidental double grants.")) return;
      confirm.disabled = true;
      try {
        await api(`${ROOT}/${workspaceState.competitionId}/rewards`, {
          method: "POST",
          body: JSON.stringify({ action: "CONFIRM_PLAN" })
        });
        await loadRewards();
      } catch (error) {
        window.alert(errorText(error));
        confirm.disabled = false;
      }
    });
    runtimeSection.append(confirm);
  }

  const deliveries = runtime.deliveries ?? [];
  if (deliveries.length) {
    const controls = el("div", "admin-workspace-toolbar");
    controls.append(el("span", "admin-muted", `${deliveries.length} ledger deliveries`));
    const pending = deliveries.filter((delivery) => ["PENDING", "FAILED"].includes(delivery.state));
    if (pending.length) {
      const process = el("button", "button-secondary", "Process pending / retry failed");
      process.type = "button";
      process.addEventListener("click", async () => {
        process.disabled = true;
        try {
          await api(`${ROOT}/${workspaceState.competitionId}/rewards/process`, {
            method: "POST",
            body: JSON.stringify({ action: "PROCESS_PENDING" })
          });
          await loadRewards();
        } catch (error) {
          window.alert(errorText(error));
          process.disabled = false;
        }
      });
      controls.append(process);
    }
    runtimeSection.append(controls);
    const ledger = el("div", "reward-ledger-list");
    for (const delivery of deliveries) {
      const row = el("article", "reward-ledger-row");
      const copy = el("div");
      copy.append(
        el("strong", "", `${delivery.publicLabel || pretty(delivery.rewardType)} · ${pretty(delivery.state)}`),
        el("span", "admin-muted", `${delivery.recipientUuid || "manual"} · attempts ${delivery.attempts} · ${delivery.operationKey}`)
      );
      row.append(copy);
      if (delivery.state === "FAILED") {
        const retry = el("button", "button-secondary", "Retry");
        retry.type = "button";
        retry.addEventListener("click", async () => {
          retry.disabled = true;
          try {
            await api(`${ROOT}/${workspaceState.competitionId}/rewards/process`, {
              method: "POST",
              body: JSON.stringify({ action: "RETRY_ONE", deliveryId: delivery.id })
            });
            await loadRewards();
          } catch (error) {
            window.alert(errorText(error));
            retry.disabled = false;
          }
        });
        row.append(retry);
      }
      ledger.append(row);
    }
    runtimeSection.append(ledger);
  }
  body.replaceChildren(configSection, runtimeSection);
}

async function loadRewards() {
  const id = workspaceState.competitionId;
  if (!id) return;
  setLoading("rewards", "Loading rewards…");
  try {
    const configPayload = await api(`${ROOT}/${id}/reward-config`);
    workspaceState.rewardConfig = structuredClone(configPayload);
    if (configPayload.lifecycleState === "DRAFT") {
      renderDraftRewards();
      return;
    }
    const runtime = await api(`${ROOT}/${id}/rewards`).catch((error) => ({ planningError: errorText(error), deliveries: [] }));
    workspaceState.rewardRuntime = runtime;
    renderRuntimeRewards(configPayload, runtime);
  } catch (error) {
    panelBody("rewards")?.replaceChildren(el("div", "admin-inline-alert admin-danger", errorText(error)));
  }
}

initWorkspace();
