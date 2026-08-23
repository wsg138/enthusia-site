const API_ROOT = "/api/competitions";

class ApiError extends Error {
  constructor(code, status, payload = {}) {
    super(code);
    this.code = code;
    this.status = status;
    this.payload = payload;
  }
}

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      accept: "application/json",
      ...(options.body && typeof options.body === "string" ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.error || `HTTP_${response.status}`, response.status, payload);
  return payload;
}

function humanError(error) {
  const code = error?.code ?? error?.message ?? "unknown_error";
  const labels = {
    unauthorized: "Sign in with your linked Enthusia account to use this feature.",
    competition_bridge_unavailable: "Minecraft account data is temporarily unavailable.",
    minecraft_account_not_linked: "That Minecraft account is not linked to your website account.",
    submissions_not_open: "Submissions are not open right now.",
    player_entry_limit_reached: "You have reached this competition's entry limit.",
    guild_entry_limit_reached: "This guild has reached its entry limit.",
    guild_submission_permission_required: "Your guild role cannot submit this guild entry.",
    invalid_submission_details: "Check the title, description, and private location fields.",
    submission_revision_conflict: "This entry changed elsewhere. Reload it before continuing.",
    submission_locked: "This entry is locked at the current competition stage.",
    submission_image_limit_reached: "This entry already has the maximum number of images.",
    image_too_large: "That image is too large.",
    unsupported_image_type: "Only PNG and JPEG images are accepted.",
    image_blocked_by_moderation: "That image cannot be accepted.",
    image_moderation_unavailable: "Image safety checking is temporarily unavailable.",
    submission_image_count_invalid: "Add the required number of images before submitting.",
    submission_coordinates_required: "Exact private coordinates are required before submitting.",
    submission_text_blocked: "The title or description cannot be accepted as written.",
    moderation_unavailable: "Content safety checking is temporarily unavailable.",
    contributor_roster_locked: "The contributor roster is locked now that voting has begun.",
    minecraft_player_not_found: "That Minecraft player could not be found.",
    contributor_already_listed: "That player is already listed on this entry.",
    contributor_role_limit_reached: "That contributor role has reached its configured limit.",
    judge_can_only_be_helper: "An assigned judge can only be credited as an unrewarded helper.",
    invite_not_found: "That invitation is no longer pending.",
    insufficient_active_playtime: "You do not yet meet the active-playtime requirement to vote.",
    judges_cannot_vote: "Assigned judges cannot cast a public ballot.",
    cannot_vote_for_entry: "You cannot vote for that entry.",
    ballot_changes_disabled: "This competition does not allow ballot changes.",
    voting_not_open: "Community voting is not open right now.",
    invalid_ballot: "Choose only eligible entries within the ballot limit."
  };
  return labels[code] ?? String(code).replaceAll("_", " ");
}

function slugFromLocation() {
  return new URLSearchParams(window.location.search).get("competition")?.trim().toLowerCase() ?? "";
}

async function waitForShell(timeout = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const tabs = document.querySelector(".competition-detail-tabs");
    const content = document.querySelector(".competition-detail-content");
    if (tabs && content) return { tabs, content };
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return null;
}

function canEdit(competition, submission) {
  if (competition.lifecycleState === "SUBMISSIONS_OPEN" && submission.status === "DRAFT") return true;
  if (competition.lifecycleState !== "REVIEW" || submission.status !== "NEEDS_CHANGES") return false;
  const close = Date.parse(competition.config?.schedule?.reviewCloseAt ?? "");
  return Number.isFinite(close) && Date.now() <= close;
}

function statusLabel(status) {
  return ({
    DRAFT: "Draft",
    PENDING_REVIEW: "Pending staff review",
    NEEDS_CHANGES: "Needs changes",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    DISQUALIFIED: "Disqualified",
    WITHDRAWN: "Withdrawn"
  })[status] ?? status;
}

function field(labelText, control, hint = "") {
  const label = el("label", "participant-field");
  label.append(el("span", "participant-field-label", labelText), control);
  if (hint) label.append(el("span", "participant-muted", hint));
  return label;
}

function input(type, name, value = "") {
  const node = document.createElement("input");
  node.type = type;
  node.name = name;
  node.value = value ?? "";
  return node;
}

function setMessage(wizard, text, kind = "") {
  wizard.message.textContent = text;
  wizard.message.className = `participant-wizard-message${kind ? ` ${kind}` : ""}`;
}

function addTab(state) {
  const button = el("button", "", "My Submission");
  button.type = "button";
  button.dataset.tab = "my-submission";
  const vote = state.shell.tabs.querySelector('[data-tab="vote"]');
  if (vote) state.shell.tabs.insertBefore(button, vote);
  else state.shell.tabs.append(button);

  const panel = el("section", "competition-tab-panel participant-panel");
  panel.dataset.tabPanel = "my-submission";
  panel.hidden = true;
  state.shell.content.append(panel);
  state.panel = panel;

  button.addEventListener("click", () => {
    state.shell.tabs.querySelectorAll("[data-tab]").forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
    state.shell.content.querySelectorAll("[data-tab-panel]").forEach((candidate) => {
      candidate.hidden = candidate.dataset.tabPanel !== "my-submission";
    });
  });
}

async function refreshOwn(state) {
  const [submissions, invites] = await Promise.all([
    api(`${API_ROOT}/${encodeURIComponent(state.slug)}/submissions`),
    api(`${API_ROOT}/invites`)
  ]);
  state.submissions = submissions.submissions ?? [];
  state.invites = invites.invites ?? [];
}

function renderInvites(state, root) {
  if (!state.invites.length) return;
  const section = el("section", "participant-card");
  section.append(el("h3", "", "Pending contributor invitations"));
  const list = el("div", "participant-stack");
  state.invites.forEach((invite) => {
    const row = el("article", "participant-invite-row");
    const copy = el("div");
    copy.append(el("strong", "", invite.submissionTitle || "Competition entry"), el("span", "participant-muted", `${invite.competitionTitle || "Competition"} · ${invite.role}`));
    const actions = el("div", "participant-inline-actions");
    for (const [accepted, label] of [[true, "Accept"], [false, "Decline"]]) {
      const button = el("button", accepted ? "competition-primary-action" : "participant-secondary-button", label);
      button.type = "button";
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await api(`${API_ROOT}/invites`, {
            method: "POST",
            body: JSON.stringify({ competitionId: invite.competitionId, submissionId: invite.submissionId, playerUuid: invite.playerUuid, accept: accepted })
          });
          await refreshOwn(state);
          renderWorkspace(state);
        } catch (error) {
          window.alert(humanError(error));
          button.disabled = false;
        }
      });
      actions.append(button);
    }
    row.append(copy, actions);
    list.append(row);
  });
  section.append(list);
  root.append(section);
}

function renderEntries(state, root) {
  const section = el("section", "participant-card");
  const heading = el("div", "participant-section-heading");
  const copy = el("div");
  copy.append(el("h3", "", "Your entries"), el("p", "participant-muted", state.submissions.length ? `${state.submissions.length} entry${state.submissions.length === 1 ? "" : "ies"}.` : "No entries yet."));
  heading.append(copy);
  if (state.competition.lifecycleState === "SUBMISSIONS_OPEN") {
    const create = el("button", "competition-primary-action", "Create entry");
    create.type = "button";
    create.addEventListener("click", () => openWizard(state));
    heading.append(create);
  }
  section.append(heading);
  const list = el("div", "participant-entry-list");
  if (!state.submissions.length) list.append(el("div", "competition-empty", "Create a private draft when you are ready."));
  state.submissions.forEach((submission) => {
    const row = el("article", "participant-entry-row");
    const main = el("div");
    const top = el("div", "participant-entry-top");
    top.append(el("strong", "", submission.title), el("span", "competition-badge", statusLabel(submission.status)));
    main.append(top, el("span", "participant-muted", `${submission.entryType} · ${submission.ownerName}`));
    if (submission.moderation?.publicReason && ["NEEDS_CHANGES", "REJECTED", "DISQUALIFIED"].includes(submission.status)) {
      const notice = el("div", "participant-moderation-notice");
      notice.append(el("strong", "", submission.status === "NEEDS_CHANGES" ? "Staff requested changes" : "Staff note"), el("p", "", submission.moderation.publicReason));
      main.append(notice);
    }
    const manage = el("button", "participant-secondary-button", canEdit(state.competition, submission) ? "Continue editing" : "View entry");
    manage.type = "button";
    manage.addEventListener("click", () => openWizard(state, submission.id));
    row.append(main, manage);
    list.append(row);
  });
  section.append(list);
  root.append(section);
}

function renderWorkspace(state) {
  const root = state.panel;
  root.replaceChildren();
  const intro = el("div", "participant-section-heading");
  const copy = el("div");
  copy.append(el("p", "competitions-kicker", "Your competition workspace"), el("h2", "", "My Submission"));
  copy.append(el("p", "participant-muted", `Signed in as ${state.me.selectedPlayer?.name ?? "linked player"} · ${state.me.activeMinutes} active minutes`));
  intro.append(copy);
  root.append(intro);
  renderInvites(state, root);
  renderEntries(state, root);
  const host = el("div", "participant-wizard-host");
  host.id = "participantWizardHost";
  root.append(host);
}

function modelFromSubmission(state, submission) {
  return {
    entryType: submission?.entryType ?? state.competition.config.entries.allowedTypes?.[0] ?? "SOLO",
    ownerUuid: submission?.ownerUuid ?? state.me.selectedPlayer?.uuid ?? state.me.linkedMinecraftAccounts?.[0]?.uuid ?? "",
    guildId: submission?.guildId ?? "",
    title: submission?.title ?? "",
    description: submission?.description ?? "",
    location: submission?.location ? {
      worldName: submission.location.worldName,
      x: submission.location.x,
      y: submission.location.y,
      z: submission.location.z,
      exactCoordinatesConfirmed: Boolean(submission.location.exactCoordinatesConfirmed)
    } : null
  };
}

function validateModel(wizard, requireLocation = true) {
  const { model, state } = wizard;
  if (!model.title.trim() || model.title.trim().length > 100) return "Enter a title of 1–100 characters.";
  const max = state.competition.config.entries.maxDescriptionChars;
  if (!model.description.trim() || model.description.trim().length > max) return `Enter a description of 1–${max} characters.`;
  if (!state.competition.config.entries.allowedTypes.includes(model.entryType)) return "Choose an allowed entry type.";
  if (model.entryType === "GUILD" && !model.guildId) return "Choose a guild.";
  if (requireLocation && state.competition.config.entries.coordinatesRequested) {
    const loc = model.location;
    if (!loc || !loc.worldName || !Number.isInteger(loc.x) || !Number.isInteger(loc.y) || !Number.isInteger(loc.z) || loc.exactCoordinatesConfirmed !== true) {
      return "Enter exact private world/X/Y/Z coordinates and confirm them.";
    }
  }
  return null;
}

async function createDraft(wizard) {
  const invalid = validateModel(wizard, true);
  if (invalid) throw new Error(invalid);
  const response = await api(`${API_ROOT}/${encodeURIComponent(wizard.state.slug)}/submissions`, {
    method: "POST",
    body: JSON.stringify(wizard.model)
  });
  wizard.submission = response.submission;
  await reloadWizardSubmission(wizard);
}

async function saveDraft(wizard) {
  if (!wizard.submission || !canEdit(wizard.state.competition, wizard.submission)) return;
  const invalid = validateModel(wizard, true);
  if (invalid) throw new Error(invalid);
  const response = await api(`${API_ROOT}/${encodeURIComponent(wizard.state.slug)}/submissions/${wizard.submission.id}`, {
    method: "PUT",
    body: JSON.stringify({
      expectedRevision: wizard.submission.revision,
      title: wizard.model.title.trim(),
      description: wizard.model.description.trim(),
      location: wizard.model.location
    })
  });
  wizard.submission = response.submission;
}

async function reloadWizardSubmission(wizard) {
  const payload = await api(`${API_ROOT}/${encodeURIComponent(wizard.state.slug)}/submissions/${wizard.submission.id}`);
  wizard.submission = payload.submission;
  wizard.model = modelFromSubmission(wizard.state, wizard.submission);
}

function detailsStep(wizard, panel) {
  panel.append(el("h3", "", "Entry details"));
  const grid = el("div", "participant-form-grid");
  const type = selectFor(wizard.state.competition.config.entries.allowedTypes.map((value) => [value, value === "GROUP" ? "Group / team" : value[0] + value.slice(1).toLowerCase()]), wizard.model.entryType);
  type.disabled = Boolean(wizard.submission);
  type.addEventListener("change", () => { wizard.model.entryType = type.value; guildWrap.hidden = type.value !== "GUILD"; });
  const account = selectFor((wizard.state.me.linkedMinecraftAccounts ?? []).map((item) => [item.uuid, item.name]), wizard.model.ownerUuid);
  account.disabled = Boolean(wizard.submission);
  account.addEventListener("change", () => { wizard.model.ownerUuid = account.value; });
  const guild = selectFor([["", "Choose a guild"], ...(wizard.state.me.guilds ?? []).filter((item) => item.canSubmit).map((item) => [item.id, item.name])], wizard.model.guildId);
  guild.disabled = Boolean(wizard.submission);
  guild.addEventListener("change", () => { wizard.model.guildId = guild.value; });
  const guildWrap = field("Guild", guild);
  guildWrap.hidden = wizard.model.entryType !== "GUILD";
  grid.append(field("Entry type", type), field("Minecraft account", account), guildWrap);
  panel.append(grid);

  const title = input("text", "title", wizard.model.title);
  title.maxLength = 100;
  title.addEventListener("input", () => { wizard.model.title = title.value; });
  const description = document.createElement("textarea");
  description.rows = 9;
  description.maxLength = wizard.state.competition.config.entries.maxDescriptionChars;
  description.value = wizard.model.description;
  description.addEventListener("input", () => { wizard.model.description = description.value; counter.textContent = `${description.value.length.toLocaleString()} / ${description.maxLength.toLocaleString()}`; });
  const descField = field(`Description (up to ${description.maxLength.toLocaleString()} characters)`, description);
  const counter = el("span", "participant-character-count", `${description.value.length.toLocaleString()} / ${description.maxLength.toLocaleString()}`);
  descField.append(counter);
  panel.append(field("Title", title), descField);
}

function selectFor(options, value) {
  const select = document.createElement("select");
  options.forEach(([optionValue, label]) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = label;
    select.append(option);
  });
  select.value = value ?? "";
  return select;
}

function locationStep(wizard, panel) {
  panel.append(el("h3", "", "Private location"));
  if (!wizard.state.competition.config.entries.coordinatesRequested) {
    panel.append(el("div", "competition-empty", "This competition does not ask for coordinates."));
    return;
  }
  panel.append(el("div", "competition-private-warning", "World and coordinates remain private. They are never included in the public entry data. Assigned judges only see them if this competition explicitly permits judge location access."));
  if (!wizard.model.location) wizard.model.location = { worldName: "", x: null, y: null, z: null, exactCoordinatesConfirmed: false };
  const loc = wizard.model.location;
  const grid = el("div", "participant-form-grid participant-location-grid");
  const world = input("text", "worldName", loc.worldName);
  const x = input("number", "x", loc.x ?? "");
  const y = input("number", "y", loc.y ?? "");
  const z = input("number", "z", loc.z ?? "");
  world.addEventListener("input", () => { loc.worldName = world.value.trim(); });
  for (const [control, key] of [[x, "x"], [y, "y"], [z, "z"]]) control.addEventListener("input", () => { loc[key] = control.value === "" ? null : Number(control.value); });
  grid.append(field("World", world), field("X", x), field("Y", y), field("Z", z));
  panel.append(grid);
  const confirm = input("checkbox", "confirm");
  confirm.checked = loc.exactCoordinatesConfirmed;
  confirm.addEventListener("change", () => { loc.exactCoordinatesConfirmed = confirm.checked; });
  const check = el("label", "participant-check");
  check.append(confirm, el("span", "", "I confirm these are the exact coordinates staff should use to find this entry."));
  panel.append(check);
}

async function sanitizeImage(file) {
  if (!file || !["image/png", "image/jpeg"].includes(file.type)) throw new Error("Only PNG and JPEG images are accepted.");
  if (typeof createImageBitmap !== "function") return file;
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { alpha: file.type === "image/png" });
    if (!context) return file;
    if (file.type === "image/jpeg") {
      context.fillStyle = "#000";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, 0, 0);
    return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob || file), file.type, file.type === "image/jpeg" ? 0.92 : undefined));
  } finally {
    bitmap.close?.();
  }
}

function imageUrl(wizard, imageId) {
  return `${API_ROOT}/${encodeURIComponent(wizard.state.slug)}/submissions/${wizard.submission.id}/images/${imageId}`;
}

async function reorderImages(wizard, ids, coverId) {
  const result = await api(`${API_ROOT}/${encodeURIComponent(wizard.state.slug)}/submissions/${wizard.submission.id}/images/order`, {
    method: "POST",
    body: JSON.stringify({ expectedRevision: wizard.submission.revision, imageIds: ids, coverImageId: coverId })
  });
  wizard.submission.revision = result.revision;
  await reloadWizardSubmission(wizard);
  renderWizard(wizard);
}

function imagesStep(wizard, panel) {
  panel.append(el("h3", "", "Images"));
  const limits = wizard.state.competition.config.entries;
  panel.append(el("p", "participant-muted", `Upload ${limits.minImages}–${limits.maxImages} screenshots. The selected cover image appears first publicly.`));
  const warning = el("div", "participant-image-warning");
  warning.append(el("strong", "", "Before uploading"), el("p", "", "Competition screenshots become public after approval. Hide coordinates, minimap waypoints, private chat, private base locations, and anything else you do not want published."));
  panel.append(warning);
  if (!wizard.submission) {
    panel.append(el("div", "competition-empty", "Save the entry first."));
    return;
  }
  const images = [...(wizard.submission.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const grid = el("div", "participant-image-grid");
  images.forEach((image, index) => {
    const card = el("article", "participant-image-card");
    const preview = document.createElement("img");
    preview.src = imageUrl(wizard, image.id);
    preview.alt = `Submission screenshot ${index + 1}`;
    preview.loading = "lazy";
    const meta = el("div", "participant-image-meta");
    meta.append(el("strong", "", wizard.submission.coverImageId === image.id ? "Cover image" : `Image ${index + 1}`));
    const actions = el("div", "participant-image-actions");
    const cover = el("button", "participant-secondary-button", "Set cover");
    cover.type = "button";
    cover.disabled = wizard.submission.coverImageId === image.id || !canEdit(wizard.state.competition, wizard.submission);
    cover.addEventListener("click", () => reorderImages(wizard, images.map((item) => item.id), image.id).catch((error) => setMessage(wizard, humanError(error), "is-error")));
    const up = el("button", "participant-secondary-button", "↑");
    up.type = "button";
    up.disabled = index === 0 || !canEdit(wizard.state.competition, wizard.submission);
    up.addEventListener("click", () => {
      const ids = images.map((item) => item.id);
      [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
      reorderImages(wizard, ids, wizard.submission.coverImageId || ids[0]).catch((error) => setMessage(wizard, humanError(error), "is-error"));
    });
    const down = el("button", "participant-secondary-button", "↓");
    down.type = "button";
    down.disabled = index === images.length - 1 || !canEdit(wizard.state.competition, wizard.submission);
    down.addEventListener("click", () => {
      const ids = images.map((item) => item.id);
      [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
      reorderImages(wizard, ids, wizard.submission.coverImageId || ids[0]).catch((error) => setMessage(wizard, humanError(error), "is-error"));
    });
    const remove = el("button", "participant-danger-button", "Remove");
    remove.type = "button";
    remove.disabled = !canEdit(wizard.state.competition, wizard.submission);
    remove.addEventListener("click", async () => {
      try {
        const response = await fetch(imageUrl(wizard, image.id), { method: "DELETE", credentials: "same-origin", headers: { accept: "application/json", "x-submission-revision": String(wizard.submission.revision) } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new ApiError(payload.error || `HTTP_${response.status}`, response.status, payload);
        await reloadWizardSubmission(wizard);
        renderWizard(wizard);
      } catch (error) { setMessage(wizard, humanError(error), "is-error"); }
    });
    actions.append(cover, up, down, remove);
    meta.append(actions);
    card.append(preview, meta);
    grid.append(card);
  });
  panel.append(grid);

  if (canEdit(wizard.state.competition, wizard.submission) && images.length < limits.maxImages) {
    const upload = el("div", "participant-upload-row");
    const file = input("file", "image");
    file.accept = "image/png,image/jpeg";
    const button = el("button", "competition-primary-action", "Upload image");
    button.type = "button";
    button.addEventListener("click", async () => {
      if (!file.files?.[0]) return setMessage(wizard, "Choose an image first.", "is-error");
      button.disabled = true;
      setMessage(wizard, "Preparing and checking image…");
      try {
        const blob = await sanitizeImage(file.files[0]);
        const response = await fetch(`${API_ROOT}/${encodeURIComponent(wizard.state.slug)}/submissions/${wizard.submission.id}/images`, {
          method: "POST",
          credentials: "same-origin",
          headers: { accept: "application/json", "content-type": blob.type || file.files[0].type, "x-submission-revision": String(wizard.submission.revision) },
          body: blob
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new ApiError(payload.error || `HTTP_${response.status}`, response.status, payload);
        await reloadWizardSubmission(wizard);
        renderWizard(wizard);
      } catch (error) {
        setMessage(wizard, humanError(error), "is-error");
        button.disabled = false;
      }
    });
    upload.append(file, button);
    panel.append(upload);
  }
}

function contributorsStep(wizard, panel) {
  panel.append(el("h3", "", "Contributors"));
  if (!wizard.submission) return panel.append(el("div", "competition-empty", "Save the entry first."));
  if (wizard.submission.entryType === "SOLO") return panel.append(el("div", "competition-empty", "Solo entries have one owner and no contributor roster."));
  const list = el("div", "participant-stack");
  for (const participant of wizard.submission.participants ?? []) {
    const row = el("div", "participant-contributor-row");
    const copy = el("div");
    copy.append(el("strong", "", participant.playerName), el("span", "participant-muted", `${participant.role} · ${participant.inviteStatus}`));
    row.append(copy);
    if (participant.role !== "OWNER" && canEdit(wizard.state.competition, wizard.submission)) {
      const remove = el("button", "participant-secondary-button", "Remove");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        try {
          await api(`${API_ROOT}/${encodeURIComponent(wizard.state.slug)}/submissions/${wizard.submission.id}/contributors`, { method: "POST", body: JSON.stringify({ action: "REMOVE", playerUuid: participant.playerUuid }) });
          await reloadWizardSubmission(wizard);
          renderWizard(wizard);
        } catch (error) { setMessage(wizard, humanError(error), "is-error"); }
      });
      row.append(remove);
    }
    list.append(row);
  }
  panel.append(list);
  if (!canEdit(wizard.state.competition, wizard.submission)) return;
  const invite = el("div", "participant-contributor-invite");
  const name = input("text", "contributorName");
  name.maxLength = 16;
  name.placeholder = "Minecraft username";
  const roles = wizard.submission.entryType === "GROUP" ? [["MAIN", "Main member"], ["HELPER", "Helper / credit only"]] : [["GUILD_WORKER", "Guild worker"]];
  const role = selectFor(roles, roles[0][0]);
  const button = el("button", "competition-primary-action", "Send invite");
  button.type = "button";
  button.addEventListener("click", async () => {
    if (!/^[A-Za-z0-9_]{1,16}$/.test(name.value.trim())) return setMessage(wizard, "Enter a valid Minecraft username.", "is-error");
    button.disabled = true;
    try {
      await api(`${API_ROOT}/${encodeURIComponent(wizard.state.slug)}/submissions/${wizard.submission.id}/contributors`, { method: "POST", body: JSON.stringify({ action: "INVITE", minecraftName: name.value.trim(), role: role.value }) });
      await reloadWizardSubmission(wizard);
      renderWizard(wizard);
    } catch (error) {
      setMessage(wizard, humanError(error), "is-error");
      button.disabled = false;
    }
  });
  invite.append(field("Minecraft username", name), field("Role", role), button);
  panel.append(invite);
}

function reviewStep(wizard, panel) {
  panel.append(el("h3", "", "Review & submit"));
  if (!wizard.submission) return panel.append(el("div", "competition-empty", "Save the entry first."));
  const limits = wizard.state.competition.config.entries;
  const images = wizard.submission.images ?? [];
  const blockers = [];
  if (images.length < limits.minImages) blockers.push(`Add at least ${limits.minImages} image${limits.minImages === 1 ? "" : "s"}.`);
  if (images.length > limits.maxImages) blockers.push(`Remove images until no more than ${limits.maxImages} remain.`);
  if (limits.coordinatesRequested && !wizard.submission.location?.exactCoordinatesConfirmed) blockers.push("Confirm exact private coordinates.");
  const summary = el("div", "participant-review-grid");
  summary.append(el("div", "participant-review-item", `Status: ${statusLabel(wizard.submission.status)}`), el("div", "participant-review-item", `Entry type: ${wizard.submission.entryType}`), el("div", "participant-review-item", `Images: ${images.length}`), el("div", "participant-review-item", `Accepted people: ${(wizard.submission.participants ?? []).filter((person) => person.inviteStatus === "ACCEPTED").length}`));
  panel.append(summary);
  const warning = el("div", "participant-image-warning");
  warning.append(el("strong", "", "Publication check"), el("p", "", "After approval, the title, description, credited usernames/guild, and screenshots can become public. Exact location fields remain private. Recheck every screenshot for coordinates, waypoints, chat, or other private information."));
  panel.append(warning);
  const notice = wizard.state.submissions.find((item) => item.id === wizard.submission.id)?.moderation;
  if (notice?.publicReason && wizard.submission.status === "NEEDS_CHANGES") {
    const changes = el("div", "participant-moderation-notice");
    changes.append(el("strong", "", "Requested changes"), el("p", "", notice.publicReason));
    panel.append(changes);
  }
  if (blockers.length) {
    const box = el("div", "participant-moderation-notice");
    box.append(el("strong", "", "Before you can submit"));
    const list = document.createElement("ul");
    blockers.forEach((message) => list.append(el("li", "", message)));
    box.append(list);
    panel.append(box);
    return;
  }
  if (canEdit(wizard.state.competition, wizard.submission)) {
    const submit = el("button", "competition-primary-action", wizard.submission.status === "NEEDS_CHANGES" ? "Resubmit for staff review" : "Submit for staff review");
    submit.type = "button";
    submit.addEventListener("click", async () => {
      submit.disabled = true;
      setMessage(wizard, "Running final safety checks…");
      try {
        const response = await api(`${API_ROOT}/${encodeURIComponent(wizard.state.slug)}/submissions/${wizard.submission.id}`, {
          method: "POST",
          body: JSON.stringify({ action: "SUBMIT", expectedRevision: wizard.submission.revision })
        });
        wizard.submission.status = response.status;
        wizard.submission.revision = response.revision;
        await refreshOwn(wizard.state);
        setMessage(wizard, "Submitted for staff review.", "is-success");
        renderWizard(wizard);
      } catch (error) {
        setMessage(wizard, humanError(error), "is-error");
        submit.disabled = false;
      }
    });
    panel.append(submit);
  }
}

async function persistBeforeNext(wizard) {
  if (wizard.step === 0) {
    const invalid = validateModel(wizard, false);
    if (invalid) throw new Error(invalid);
    if (wizard.submission && !wizard.state.competition.config.entries.coordinatesRequested) await saveDraft(wizard);
    if (!wizard.submission && !wizard.state.competition.config.entries.coordinatesRequested) await createDraft(wizard);
    return;
  }
  if (wizard.step === 1) {
    if (!wizard.submission) await createDraft(wizard);
    else await saveDraft(wizard);
  }
}

function renderWizard(wizard) {
  const host = wizard.state.panel.querySelector("#participantWizardHost");
  if (!host) return;
  host.replaceChildren();
  const shell = el("section", "participant-card participant-wizard");
  const header = el("div", "participant-section-heading");
  const copy = el("div");
  copy.append(el("p", "competitions-kicker", wizard.submission ? statusLabel(wizard.submission.status) : "New draft"), el("h3", "", wizard.model.title || "Create competition entry"));
  const close = el("button", "participant-secondary-button", "Close");
  close.type = "button";
  close.addEventListener("click", () => host.replaceChildren());
  header.append(copy, close);
  shell.append(header);
  wizard.message = el("p", "participant-wizard-message");
  shell.append(wizard.message);

  const labels = ["Details", "Location", "Images", "Contributors", "Review"];
  const nav = el("nav", "participant-step-nav");
  labels.forEach((label, index) => {
    const button = el("button", index === wizard.step ? "participant-step-button is-active" : "participant-step-button", `${index + 1}. ${label}`);
    button.type = "button";
    button.disabled = !wizard.submission && index > 1;
    button.addEventListener("click", () => { wizard.step = index; renderWizard(wizard); });
    nav.append(button);
  });
  shell.append(nav);
  const panel = el("div", "participant-step-panel");
  if (wizard.step === 0) detailsStep(wizard, panel);
  if (wizard.step === 1) locationStep(wizard, panel);
  if (wizard.step === 2) imagesStep(wizard, panel);
  if (wizard.step === 3) contributorsStep(wizard, panel);
  if (wizard.step === 4) reviewStep(wizard, panel);
  shell.append(panel);

  const footer = el("div", "participant-wizard-footer");
  if (wizard.step > 0) {
    const back = el("button", "participant-secondary-button", "Back");
    back.type = "button";
    back.addEventListener("click", () => { wizard.step -= 1; renderWizard(wizard); });
    footer.append(back);
  }
  if (wizard.step < 4) {
    const next = el("button", "competition-primary-action", wizard.step < 2 ? "Save & continue" : "Continue");
    next.type = "button";
    next.addEventListener("click", async () => {
      next.disabled = true;
      try {
        await persistBeforeNext(wizard);
        wizard.step += 1;
        renderWizard(wizard);
      } catch (error) {
        setMessage(wizard, humanError(error), "is-error");
        next.disabled = false;
      }
    });
    footer.append(next);
  }
  if (wizard.submission && ["DRAFT", "PENDING_REVIEW", "NEEDS_CHANGES", "APPROVED"].includes(wizard.submission.status) && ["SUBMISSIONS_OPEN", "REVIEW"].includes(wizard.state.competition.lifecycleState)) {
    const withdraw = el("button", "participant-danger-button participant-withdraw", "Withdraw entry");
    withdraw.type = "button";
    withdraw.addEventListener("click", async () => {
      if (!window.confirm("Withdraw this entry? It will no longer participate.")) return;
      try {
        await api(`${API_ROOT}/${encodeURIComponent(wizard.state.slug)}/submissions/${wizard.submission.id}`, { method: "POST", body: JSON.stringify({ action: "WITHDRAW" }) });
        await refreshOwn(wizard.state);
        renderWorkspace(wizard.state);
      } catch (error) { setMessage(wizard, humanError(error), "is-error"); }
    });
    footer.append(withdraw);
  }
  shell.append(footer);
  host.append(shell);
}

async function openWizard(state, submissionId = null) {
  let submission = null;
  if (submissionId) {
    try {
      submission = (await api(`${API_ROOT}/${encodeURIComponent(state.slug)}/submissions/${submissionId}`)).submission;
    } catch (error) {
      window.alert(humanError(error));
      return;
    }
  }
  const wizard = { state, submission, model: modelFromSubmission(state, submission), step: 0, message: null };
  renderWizard(wizard);
  state.panel.querySelector("#participantWizardHost")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function renderVote(state) {
  const panel = state.shell.content.querySelector('[data-tab-panel="vote"]');
  if (!panel) return;
  panel.replaceChildren();
  if (!state.competition.config.voting?.enabled) return panel.append(el("div", "competition-empty", "This competition does not use community voting."));
  if (state.competition.lifecycleState !== "VOTING") return panel.append(el("div", "competition-empty", "Community voting is not open right now."));
  panel.append(el("div", "competition-loading", "Loading your ballot…"));
  let ballot;
  try {
    ballot = await api(`${API_ROOT}/${encodeURIComponent(state.slug)}/vote`);
  } catch (error) {
    const box = el("div", "competition-error", humanError(error));
    if (error.payload?.activeMinutes !== undefined && error.payload?.requiredMinutes !== undefined) box.append(el("p", "", `Active playtime: ${error.payload.activeMinutes} / ${error.payload.requiredMinutes} minutes required.`));
    panel.replaceChildren(box);
    return;
  }
  const shell = el("div", "participant-vote-shell");
  shell.append(el("h2", "", "Community ballot"), el("p", "participant-muted", `Choose up to ${ballot.votesPerVoter} different entries. Your selections stay private while voting is open.`));
  const message = el("p", "participant-wizard-message");
  const grid = el("div", "participant-vote-grid");
  const selected = new Set(ballot.selections ?? []);
  for (const submission of state.publicPayload.submissions ?? []) {
    const label = el("label", "participant-vote-card");
    const check = input("checkbox", `vote-${submission.id}`);
    check.value = submission.id;
    check.checked = selected.has(submission.id);
    const copy = el("div");
    copy.append(el("strong", "", submission.title), el("span", "participant-muted", submission.entryType === "GUILD" && submission.guildName ? submission.guildName : submission.ownerName));
    check.addEventListener("change", () => {
      const checked = grid.querySelectorAll('input[type="checkbox"]:checked').length;
      if (checked > ballot.votesPerVoter) {
        check.checked = false;
        message.textContent = `You can choose at most ${ballot.votesPerVoter} entries.`;
        message.className = "participant-wizard-message is-error";
      } else {
        message.textContent = `${checked} / ${ballot.votesPerVoter} selected`;
        message.className = "participant-wizard-message";
      }
    });
    label.append(check, copy);
    grid.append(label);
  }
  const save = el("button", "competition-primary-action", ballot.allowChangesUntilClose ? "Save ballot" : "Submit ballot");
  save.type = "button";
  save.addEventListener("click", async () => {
    save.disabled = true;
    try {
      const ids = [...grid.querySelectorAll('input[type="checkbox"]:checked')].map((check) => check.value);
      await api(`${API_ROOT}/${encodeURIComponent(state.slug)}/vote`, { method: "POST", body: JSON.stringify({ submissionIds: ids }) });
      message.textContent = "Ballot saved. You can change it until voting closes.";
      message.className = "participant-wizard-message is-success";
    } catch (error) {
      message.textContent = humanError(error);
      message.className = "participant-wizard-message is-error";
    } finally { save.disabled = false; }
  });
  shell.append(message, grid, save);
  panel.replaceChildren(shell);
}

async function init() {
  if (document.body.dataset.competitionPage !== "detail") return;
  const slug = slugFromLocation();
  if (!slug) return;
  const shell = await waitForShell();
  if (!shell) return;
  let publicPayload;
  try { publicPayload = await api(`${API_ROOT}/${encodeURIComponent(slug)}`); } catch { return; }
  const state = { slug, shell, competition: publicPayload.competition, publicPayload, panel: null, me: null, submissions: [], invites: [] };
  await renderVote(state);
  try {
    state.me = await api(`${API_ROOT}/${encodeURIComponent(slug)}/me`);
    addTab(state);
    await refreshOwn(state);
    renderWorkspace(state);
  } catch {
    // Signed-out visitors see the persistent header sign-in control. Do not add
    // a second empty workspace panel to an otherwise public competition page.
  }
}

init();

export { ApiError, canEdit, humanError, modelFromSubmission, validateModel };
