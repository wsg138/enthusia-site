const API_ROOT = "/api/competitions";

class ApiError extends Error {
  constructor(code, status, payload = {}) {
    super(code);
    this.code = code;
    this.status = status;
    this.payload = payload;
  }
}

function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function field(labelText, input) {
  const label = element("label", "participant-field");
  const span = element("span", "participant-field-label", labelText);
  label.append(span, input);
  return label;
}

function input(type, name, value = "") {
  const node = document.createElement("input");
  node.type = type;
  node.name = name;
  node.value = value ?? "";
  return node;
}

function humanError(error) {
  const code = error?.code ?? error?.message ?? "unknown_error";
  const labels = {
    unauthorized: "Sign in with your linked Enthusia account to use this feature.",
    competition_bridge_unavailable: "Minecraft account data is temporarily unavailable. Try again shortly.",
    minecraft_account_not_linked: "Your website account is not linked to the selected Minecraft account.",
    submissions_not_open: "Submissions are not open right now.",
    player_entry_limit_reached: "You have reached this competition's entry limit.",
    guild_entry_limit_reached: "This guild has reached its entry limit for this competition.",
    guild_submission_permission_required: "Your guild role does not have permission to submit this guild entry.",
    invalid_submission_details: "Check the title, description, and private location fields.",
    submission_revision_conflict: "This entry changed in another request. Reload it before continuing.",
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
    judges_cannot_vote: "Assigned judges cannot cast a public ballot in this competition.",
    cannot_vote_for_entry: "You cannot vote for that entry.",
    ballot_changes_disabled: "This competition does not allow ballot changes.",
    voting_not_open: "Community voting is not open right now.",
    invalid_ballot: "Choose only eligible entries within the ballot limit."
  };
  return labels[code] ?? String(code).replaceAll("_", " ");
}

async function request(path, options = {}) {
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

async function waitForDetailShell(timeoutMs = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tabs = document.querySelector(".competition-detail-tabs");
    const content = document.querySelector(".competition-detail-content");
    if (tabs && content) return { tabs, content };
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return null;
}

function slugFromLocation() {
  return new URLSearchParams(window.location.search).get("competition")?.trim().toLowerCase() ?? "";
}

function canEditSubmission(competition, submission) {
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

function addParticipantTab(shell, state) {
  const { tabs, content } = shell;
  if (tabs.querySelector('[data-tab="my-submission"]')) return;
  const voteButton = tabs.querySelector('[data-tab="vote"]');
  const button = element("button", "", "My Submission");
  button.type = "button";
  button.dataset.tab = "my-submission";
  if (voteButton) tabs.insertBefore(button, voteButton);
  else tabs.append(button);

  const panel = element("section", "competition-tab-panel participant-panel");
  panel.dataset.tabPanel = "my-submission";
  panel.hidden = true;
  content.append(panel);
  state.participantPanel = panel;

  button.addEventListener("click", () => {
    tabs.querySelectorAll("[data-tab]").forEach((candidate) => {
      candidate.classList.toggle("is-active", candidate === button);
    });
    content.querySelectorAll("[data-tab-panel]").forEach((candidate) => {
      candidate.hidden = candidate.dataset.tabPanel !== "my-submission";
    });
  });
}

function participantHeader(state) {
  const header = element("div", "participant-section-heading");
  const copy = element("div");
  copy.append(
    element("p", "competitions-kicker", "Your competition workspace"),
    element("h2", "", "My Submission")
  );
  if (state.me) {
    copy.append(element(
      "p",
      "participant-muted",
      `Signed in as ${state.me.selectedPlayer?.name ?? "linked player"} · ${state.me.activeMinutes} active minutes`
    ));
  }
  header.append(copy);
  return header;
}

function renderInvites(state, root) {
  const invites = Array.isArray(state.invites) ? state.invites : [];
  if (!invites.length) return;
  const section = element("section", "participant-card participant-invites");
  section.append(element("h3", "", "Pending contributor invitations"));
  const list = element("div", "participant-stack");
  for (const invite of invites) {
    const row = element("article", "participant-invite-row");
    const copy = element("div");
    copy.append(
      element("strong", "", invite.submissionTitle || "Competition entry"),
      element("span", "participant-muted", `${invite.competitionTitle || "Competition"} · ${invite.role}`)
    );
    const actions = element("div", "participant-inline-actions");
    const accept = element("button", "competition-primary-action", "Accept");
    accept.type = "button";
    const decline = element("button", "participant-secondary-button", "Decline");
    decline.type = "button";
    const respond = async (accepted) => {
      accept.disabled = true;
      decline.disabled = true;
      try {
        await request(`${API_ROOT}/invites`, {
          method: "POST",
          body: JSON.stringify({
            competitionId: invite.competitionId,
            submissionId: invite.submissionId,
            playerUuid: invite.playerUuid,
            accept: accepted
          })
        });
        state.invites = state.invites.filter((candidate) => !(
          candidate.competitionId === invite.competitionId
          && candidate.submissionId === invite.submissionId
          && candidate.playerUuid === invite.playerUuid
        ));
        await renderParticipant(state);
      } catch (error) {
        copy.append(element("span", "participant-error", humanError(error)));
        accept.disabled = false;
        decline.disabled = false;
      }
    };
    accept.addEventListener("click", () => respond(true));
    decline.addEventListener("click", () => respond(false));
    actions.append(accept, decline);
    row.append(copy, actions);
    list.append(row);
  }
  section.append(list);
  root.append(section);
}

function renderSubmissionList(state, root) {
  const section = element("section", "participant-card");
  const heading = element("div", "participant-section-heading");
  const copy = element("div");
  copy.append(element("h3", "", "Your entries"));
  const count = state.submissions.length;
  copy.append(element("p", "participant-muted", count ? `${count} entry${count === 1 ? "" : "ies"} on this account.` : "No entries yet."));
  heading.append(copy);

  if (state.competition.lifecycleState === "SUBMISSIONS_OPEN") {
    const create = element("button", "competition-primary-action", "Create entry");
    create.type = "button";
    create.addEventListener("click", () => openWizard(state, null));
    heading.append(create);
  }
  section.append(heading);

  if (!count) {
    section.append(element("div", "competition-empty", "Create a draft when you are ready. Entries remain private until submissions close and staff approval is complete."));
    root.append(section);
    return;
  }

  const list = element("div", "participant-entry-list");
  for (const submission of state.submissions) {
    const card = element("article", "participant-entry-row");
    const main = element("div");
    const top = element("div", "participant-entry-top");
    top.append(element("strong", "", submission.title), element("span", "competition-badge", statusLabel(submission.status)));
    main.append(top, element("p", "participant-muted", `${submission.entryType} · ${submission.ownerName}`));
    if (submission.moderation?.publicReason && ["NEEDS_CHANGES", "REJECTED", "DISQUALIFIED"].includes(submission.status)) {
      const notice = element("div", "participant-moderation-notice");
      notice.append(
        element("strong", "", submission.status === "NEEDS_CHANGES" ? "Staff requested changes" : "Staff note"),
        element("p", "", submission.moderation.publicReason)
      );
      main.append(notice);
    }
    const manage = element("button", "participant-secondary-button", canEditSubmission(state.competition, submission) ? "Continue editing" : "View entry");
    manage.type = "button";
    manage.addEventListener("click", () => openWizard(state, submission));
    card.append(main, manage);
    list.append(card);
  }
  section.append(list);
  root.append(section);
}

async function renderParticipant(state) {
  const root = state.participantPanel;
  if (!root) return;
  root.replaceChildren(participantHeader(state));
  renderInvites(state, root);
  renderSubmissionList(state, root);
  const wizardHost = element("div", "participant-wizard-host");
  wizardHost.id = "participantWizardHost";
  root.append(wizardHost);
}

function wizardStepButton(label, index, wizard) {
  const button = element("button", "participant-step-button", `${index + 1}. ${label}`);
  button.type = "button";
  button.addEventListener("click", () => {
    if (!wizard.submission && index > 1) return;
    wizard.step = index;
    renderWizard(wizard);
  });
  return button;
}

function getLocationFromForm(wizard) {
  if (!wizard.state.competition.config?.entries?.coordinatesRequested) return null;
  const worldName = wizard.form.querySelector('[name="worldName"]')?.value.trim() ?? "";
  const x = Number(wizard.form.querySelector('[name="x"]')?.value);
  const y = Number(wizard.form.querySelector('[name="y"]')?.value);
  const z = Number(wizard.form.querySelector('[name="z"]')?.value);
  const confirmed = Boolean(wizard.form.querySelector('[name="exactCoordinatesConfirmed"]')?.checked);
  if (!worldName || !Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z) || !confirmed) return undefined;
  return { worldName, x, y, z, exactCoordinatesConfirmed: true };
}

function currentDraftPayload(wizard) {
  const title = wizard.form.querySelector('[name="title"]')?.value.trim() ?? "";
  const description = wizard.form.querySelector('[name="description"]')?.value.trim() ?? "";
  const entryType = wizard.form.querySelector('[name="entryType"]')?.value ?? wizard.submission?.entryType;
  const ownerUuid = wizard.form.querySelector('[name="ownerUuid"]')?.value ?? wizard.submission?.ownerUuid;
  const guildId = wizard.form.querySelector('[name="guildId"]')?.value || null;
  return { title, description, entryType, ownerUuid, guildId, location: getLocationFromForm(wizard) };
}

function validateDraftPayload(wizard, requireLocation = true) {
  const payload = currentDraftPayload(wizard);
  const max = wizard.state.competition.config?.entries?.maxDescriptionChars ?? 2500;
  if (!payload.title || payload.title.length > 100) return "Enter a title of 1–100 characters.";
  if (!payload.description || payload.description.length > max) return `Enter a description of 1–${max} characters.`;
  if (!wizard.submission && !wizard.state.competition.config.entries.allowedTypes.includes(payload.entryType)) return "Choose a valid entry type.";
  if (payload.entryType === "GUILD" && !payload.guildId) return "Choose the guild this entry belongs to.";
  if (requireLocation && wizard.state.competition.config.entries.coordinatesRequested && payload.location === undefined) {
    return "Enter the exact private world/X/Y/Z coordinates and confirm they are exact.";
  }
  return null;
}

async function createDraft(wizard) {
  const validation = validateDraftPayload(wizard, true);
  if (validation) throw new Error(validation);
  const payload = currentDraftPayload(wizard);
  const response = await request(`${API_ROOT}/${encodeURIComponent(wizard.state.slug)}/submissions`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  wizard.submission = response.submission;
  await reloadSubmission(wizard);
  await refreshSubmissionList(wizard.state);
}

async function saveDraft(wizard) {
  if (!wizard.submission || !canEditSubmission(wizard.state.competition, wizard.submission)) return;
  const validation = validateDraftPayload(wizard, true);
  if (validation) throw new Error(validation);
  const payload = currentDraftPayload(wizard);
  const response = await request(`${API_ROOT}/${encodeURIComponent(wizard.state.slug)}/submissions/${wizard.submission.id}`, {
    method: "PUT",
    body: JSON.stringify({
      expectedRevision: wizard.submission.revision,
      title: payload.title,
      description: payload.description,
      location: payload.location
    })
  });
  wizard.submission = response.submission;
  await refreshSubmissionList(wizard.state);
}

async function reloadSubmission(wizard) {
  if (!wizard.submission?.id) return;
  const payload = await request(`${API_ROOT}/${encodeURIComponent(wizard.state.slug)}/submissions/${wizard.submission.id}`);
  wizard.submission = payload.submission;
}

async function refreshSubmissionList(state) {
  const payload = await request(`${API_ROOT}/${encodeURIComponent(state.slug)}/submissions`);
  state.submissions = Array.isArray(payload.submissions) ? payload.submissions : [];
}

function setWizardMessage(wizard, message, kind = "") {
  wizard.message.textContent = message;
  wizard.message.className = `participant-wizard-message${kind ? ` ${kind}` : ""}`;
}

function buildDetailsStep(wizard, panel) {
  const competition = wizard.state.competition;
  const submission = wizard.submission;
  panel.append(element("h3", "", "Entry details"));
  const grid = element("div", "participant-form-grid");

  const entryType = document.createElement("select");
  entryType.name = "entryType";
  for (const type of competition.config.entries.allowedTypes ?? []) {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type === "GROUP" ? "Group / team" : type.charAt(0) + type.slice(1).toLowerCase();
    entryType.append(option);
  }
  entryType.value = submission?.entryType ?? entryType.options[0]?.value ?? "SOLO";
  entryType.disabled = Boolean(submission);

  const owner = document.createElement("select");
  owner.name = "ownerUuid";
  for (const account of wizard.state.me?.linkedMinecraftAccounts ?? []) {
    const option = document.createElement("option");
    option.value = account.uuid;
    option.textContent = account.name;
    owner.append(option);
  }
  owner.value = submission?.ownerUuid ?? wizard.state.me?.selectedPlayer?.uuid ?? owner.options[0]?.value ?? "";
  owner.disabled = Boolean(submission);

  const guild = document.createElement("select");
  guild.name = "guildId";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "Choose a guild";
  guild.append(none);
  for (const item of wizard.state.me?.guilds ?? []) {
    if (!item.canSubmit) continue;
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    guild.append(option);
  }
  guild.value = submission?.guildId ?? "";
  guild.disabled = Boolean(submission);
  const guildField = field("Guild", guild);
  guildField.dataset.guildField = "true";

  grid.append(field("Entry type", entryType), field("Minecraft account", owner), guildField);
  panel.append(grid);

  const title = input("text", "title", submission?.title ?? "");
  title.maxLength = 100;
  title.required = true;
  panel.append(field("Title", title));

  const description = document.createElement("textarea");
  description.name = "description";
  description.rows = 9;
  description.maxLength = competition.config.entries.maxDescriptionChars;
  description.required = true;
  description.value = submission?.description ?? "";
  const descriptionField = field(`Description (up to ${description.maxLength.toLocaleString()} characters)`, description);
  const counter = element("span", "participant-character-count");
  const updateCounter = () => { counter.textContent = `${description.value.length.toLocaleString()} / ${description.maxLength.toLocaleString()}`; };
  description.addEventListener("input", updateCounter);
  updateCounter();
  descriptionField.append(counter);
  panel.append(descriptionField);

  const syncGuild = () => { guildField.hidden = entryType.value !== "GUILD"; };
  entryType.addEventListener("change", syncGuild);
  syncGuild();
}

function buildLocationStep(wizard, panel) {
  panel.append(element("h3", "", "Private location"));
  if (!wizard.state.competition.config.entries.coordinatesRequested) {
    panel.append(element("div", "competition-empty", "This competition does not ask for build coordinates."));
    return;
  }
  const warning = element("div", "competition-private-warning");
  warning.textContent = "World and coordinates are private. They are never included in the public entry projection. Only authorized staff can see them unless this competition explicitly allows assigned judges to visit entries.";
  panel.append(warning);

  const location = wizard.submission?.location ?? {};
  const grid = element("div", "participant-form-grid participant-location-grid");
  const world = input("text", "worldName", location.worldName ?? "");
  world.maxLength = 128;
  const x = input("number", "x", location.x ?? "");
  const y = input("number", "y", location.y ?? "");
  const z = input("number", "z", location.z ?? "");
  grid.append(field("World", world), field("X", x), field("Y", y), field("Z", z));
  panel.append(grid);

  const confirmLabel = element("label", "participant-check");
  const confirm = input("checkbox", "exactCoordinatesConfirmed");
  confirm.checked = Boolean(location.exactCoordinatesConfirmed);
  confirmLabel.append(confirm, element("span", "", "I confirm these are the exact coordinates staff should use to find this entry."));
  panel.append(confirmLabel);
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
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, file.type, file.type === "image/jpeg" ? 0.92 : undefined));
    return blob || file;
  } finally {
    bitmap.close?.();
  }
}

function imageUrl(wizard, imageId) {
  return `${API_ROOT}/${encodeURIComponent(wizard.state.slug)}/submissions/${wizard.submission.id}/images/${imageId}`;
}

async function changeImageOrder(wizard, imageIds, coverImageId) {
  const result = await request(`${API_ROOT}/${encodeURIComponent(wizard.state.slug)}/submissions/${wizard.submission.id}/images/order`, {
    method: "POST",
    body: JSON.stringify({ expectedRevision: wizard.submission.revision, imageIds, coverImageId })
  });
  wizard.submission.revision = result.revision;
  wizard.submission.coverImageId = result.coverImageId;
  await reloadSubmission(wizard);
  renderWizard(wizard);
}

function buildImagesStep(wizard, panel) {
  panel.append(element("h3", "", "Images"));
  panel.append(element("p", "participant-muted", "Upload as many screenshots as the entry needs. Each image can be up to 8 MB. Ordering controls are included for keyboard and touch users, and the selected cover image appears first publicly."));
  const privacy = element("div", "participant-image-warning");
  privacy.append(
    element("strong", "", "Before uploading"),
    element("p", "", "Competition images become public after approval. Hide coordinates, minimap waypoints, private chat, private base locations, or anything else you do not want published. Browser upload processing removes ordinary image metadata before the server stores the file.")
  );
  panel.append(privacy);

  if (!wizard.submission) {
    panel.append(element("div", "competition-empty", "Save the Details and Location steps first."));
    return;
  }

  const images = [...(wizard.submission.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const grid = element("div", "participant-image-grid");
  images.forEach((image, index) => {
    const card = element("article", "participant-image-card");
    const preview = document.createElement("img");
    preview.src = imageUrl(wizard, image.id);
    preview.alt = `Submission screenshot ${index + 1}`;
    preview.loading = "lazy";
    card.append(preview);
    const meta = element("div", "participant-image-meta");
    meta.append(element("strong", "", wizard.submission.coverImageId === image.id ? "Cover image" : `Image ${index + 1}`));
    const actions = element("div", "participant-image-actions");
    const cover = element("button", "participant-secondary-button", "Set cover");
    cover.type = "button";
    cover.disabled = wizard.submission.coverImageId === image.id || !canEditSubmission(wizard.state.competition, wizard.submission);
    cover.addEventListener("click", () => changeImageOrder(wizard, images.map((item) => item.id), image.id).catch((error) => setWizardMessage(wizard, humanError(error), "is-error")));
    const up = element("button", "participant-secondary-button", "↑");
    up.type = "button";
    up.disabled = index === 0 || !canEditSubmission(wizard.state.competition, wizard.submission);
    up.setAttribute("aria-label", "Move image earlier");
    up.addEventListener("click", () => {
      const ids = images.map((item) => item.id);
      [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
      changeImageOrder(wizard, ids, wizard.submission.coverImageId || ids[0]).catch((error) => setWizardMessage(wizard, humanError(error), "is-error"));
    });
    const down = element("button", "participant-secondary-button", "↓");
    down.type = "button";
    down.disabled = index === images.length - 1 || !canEditSubmission(wizard.state.competition, wizard.submission);
    down.setAttribute("aria-label", "Move image later");
    down.addEventListener("click", () => {
      const ids = images.map((item) => item.id);
      [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
      changeImageOrder(wizard, ids, wizard.submission.coverImageId || ids[0]).catch((error) => setWizardMessage(wizard, humanError(error), "is-error"));
    });
    const remove = element("button", "participant-danger-button", "Remove");
    remove.type = "button";
    remove.disabled = !canEditSubmission(wizard.state.competition, wizard.submission);
    remove.addEventListener("click", async () => {
      try {
        const result = await request(imageUrl(wizard, image.id), {
          method: "DELETE",
          headers: { "x-submission-revision": String(wizard.submission.revision) }
        });
        wizard.submission.revision = result.revision;
        await reloadSubmission(wizard);
        renderWizard(wizard);
      } catch (error) {
        setWizardMessage(wizard, humanError(error), "is-error");
      }
    });
    actions.append(cover, up, down, remove);
    meta.append(actions);
    card.append(meta);
    grid.append(card);
  });
  panel.append(grid);

  if (canEditSubmission(wizard.state.competition, wizard.submission)) {
    const uploadRow = element("div", "participant-upload-row");
    const file = input("file", "submissionImage");
    file.accept = "image/png,image/jpeg";
    const upload = element("button", "competition-primary-action", "Upload image");
    upload.type = "button";
    upload.addEventListener("click", async () => {
      const selected = file.files?.[0];
      if (!selected) {
        setWizardMessage(wizard, "Choose a PNG or JPEG image first.", "is-error");
        return;
      }
      upload.disabled = true;
      setWizardMessage(wizard, "Preparing and checking image…");
      try {
        const sanitized = await sanitizeImage(selected);
        const response = await fetch(`${API_ROOT}/${encodeURIComponent(wizard.state.slug)}/submissions/${wizard.submission.id}/images`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            accept: "application/json",
            "content-type": sanitized.type || selected.type,
            "x-submission-revision": String(wizard.submission.revision)
          },
          body: sanitized
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new ApiError(payload.error || `HTTP_${response.status}`, response.status, payload);
        wizard.submission.revision = payload.revision;
        await reloadSubmission(wizard);
        setWizardMessage(wizard, "Image uploaded.", "is-success");
        renderWizard(wizard);
      } catch (error) {
        setWizardMessage(wizard, humanError(error), "is-error");
        upload.disabled = false;
      }
    });
    uploadRow.append(file, upload);
    panel.append(uploadRow);
  }
}

function buildContributorsStep(wizard, panel) {
  panel.append(element("h3", "", "Contributors"));
  if (!wizard.submission) {
    panel.append(element("div", "competition-empty", "Save the entry first."));
    return;
  }
  if (wizard.submission.entryType === "SOLO") {
    panel.append(element("div", "competition-empty", "Solo entries have one owner and no contributor roster."));
    return;
  }

  const participants = wizard.submission.participants ?? [];
  const list = element("div", "participant-stack");
  for (const participant of participants) {
    const row = element("div", "participant-contributor-row");
    const copy = element("div");
    copy.append(
      element("strong", "", participant.playerName),
      element("span", "participant-muted", `${participant.role} · ${participant.inviteStatus}`)
    );
    row.append(copy);
    if (participant.role !== "OWNER" && canEditSubmission(wizard.state.competition, wizard.submission)) {
      const remove = element("button", "participant-secondary-button", "Remove");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        try {
          await request(`${API_ROOT}/${encodeURIComponent(wizard.state.slug)}/submissions/${wizard.submission.id}/contributors`, {
            method: "POST",
            body: JSON.stringify({ action: "REMOVE", playerUuid: participant.playerUuid })
          });
          await reloadSubmission(wizard);
          renderWizard(wizard);
        } catch (error) {
          setWizardMessage(wizard, humanError(error), "is-error");
        }
      });
      row.append(remove);
    }
    list.append(row);
  }
  panel.append(list);

  if (!canEditSubmission(wizard.state.competition, wizard.submission)) return;
  const form = element("div", "participant-contributor-invite");
  const name = input("text", "contributorName");
  name.placeholder = "Minecraft username";
  name.maxLength = 16;
  const role = document.createElement("select");
  role.name = "contributorRole";
  const roles = wizard.submission.entryType === "GROUP" ? ["MAIN", "HELPER"] : ["GUILD_WORKER"];
  for (const value of roles) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value === "MAIN" ? "Main member" : value === "HELPER" ? "Helper / credit only" : "Guild worker";
    role.append(option);
  }
  const invite = element("button", "competition-primary-action", "Send invite");
  invite.type = "button";
  invite.addEventListener("click", async () => {
    if (!/^[A-Za-z0-9_]{1,16}$/.test(name.value.trim())) {
      setWizardMessage(wizard, "Enter a valid Minecraft username.", "is-error");
      return;
    }
    invite.disabled = true;
    try {
      await request(`${API_ROOT}/${encodeURIComponent(wizard.state.slug)}/submissions/${wizard.submission.id}/contributors`, {
        method: "POST",
        body: JSON.stringify({ action: "INVITE", minecraftName: name.value.trim(), role: role.value })
      });
      await reloadSubmission(wizard);
      setWizardMessage(wizard, "Invitation sent. They can accept or decline from their competition workspace; the server notification bridge also queues the in-game reminder.", "is-success");
      renderWizard(wizard);
    } catch (error) {
      setWizardMessage(wizard, humanError(error), "is-error");
      invite.disabled = false;
    }
  });
  form.append(field("Minecraft username", name), field("Role", role), invite);
  panel.append(form);
}

function buildReviewStep(wizard, panel) {
  panel.append(element("h3", "", "Review & submit"));
  if (!wizard.submission) {
    panel.append(element("div", "competition-empty", "Complete the first steps before review."));
    return;
  }

  const submission = wizard.submission;
  const images = submission.images ?? [];
  const accepted = (submission.participants ?? []).filter((participant) => participant.inviteStatus === "ACCEPTED");
  const summary = element("div", "participant-review-grid");
  summary.append(
    element("div", "participant-review-item", `Status: ${statusLabel(submission.status)}`),
    element("div", "participant-review-item", `Entry type: ${submission.entryType}`),
    element("div", "participant-review-item", `Images: ${images.length}`),
    element("div", "participant-review-item", `Accepted people: ${accepted.length}`)
  );
  panel.append(summary);

  const publicWarning = element("div", "participant-image-warning");
  publicWarning.append(
    element("strong", "", "Publication check"),
    element("p", "", "After approval and the submission period, the title, description, usernames/guild credit, and uploaded screenshots can become public. Exact location fields remain private. Recheck every screenshot for coordinates, waypoints, chat, or private information before submitting.")
  );
  panel.append(publicWarning);

  const limits = wizard.state.competition.config.entries;
  const blockers = [];
  if (images.length < limits.minImages) blockers.push(`Add at least ${limits.minImages} image${limits.minImages === 1 ? "" : "s"}.`);
  if (limits.coordinatesRequested && !submission.location?.exactCoordinatesConfirmed) blockers.push("Confirm exact private coordinates.");
  if (blockers.length) {
    const block = element("div", "participant-moderation-notice");
    block.append(element("strong", "", "Before you can submit"));
    const list = document.createElement("ul");
    blockers.forEach((message) => list.append(element("li", "", message)));
    block.append(list);
    panel.append(block);
  }

  if (submission.status === "NEEDS_CHANGES") {
    const noticeRecord = wizard.state.submissions.find((candidate) => candidate.id === submission.id)?.moderation;
    if (noticeRecord?.publicReason) {
      const notice = element("div", "participant-moderation-notice");
      notice.append(element("strong", "", "Requested changes"), element("p", "", noticeRecord.publicReason));
      panel.append(notice);
    }
  }

  if (canEditSubmission(wizard.state.competition, submission) && !blockers.length) {
    const submit = element("button", "competition-primary-action participant-submit-final", submission.status === "NEEDS_CHANGES" ? "Resubmit for review" : "Submit for staff review");
    submit.type = "button";
    submit.addEventListener("click", async () => {
      submit.disabled = true;
      setWizardMessage(wizard, "Running final safety checks…");
      try {
        await saveDraft(wizard);
        const result = await request(`${API_ROOT}/${encodeURIComponent(wizard.state.slug)}/submissions/${submission.id}`, {
          method: "POST",
          body: JSON.stringify({ action: "SUBMIT", expectedRevision: wizard.submission.revision })
        });
        wizard.submission.status = result.status;
        wizard.submission.revision = result.revision;
        await refreshSubmissionList(wizard.state);
        setWizardMessage(wizard, "Submitted for staff review.", "is-success");
        renderWizard(wizard);
      } catch (error) {
        setWizardMessage(wizard, humanError(error), "is-error");
        submit.disabled = false;
      }
    });
    panel.append(submit);
  }
}

function renderWizard(wizard) {
  const host = wizard.state.participantPanel.querySelector("#participantWizardHost");
  if (!host) return;
  host.replaceChildren();
  const shell = element("section", "participant-card participant-wizard");
  const heading = element("div", "participant-section-heading");
  const titleCopy = element("div");
  titleCopy.append(
    element("p", "competitions-kicker", wizard.submission ? statusLabel(wizard.submission.status) : "New draft"),
    element("h3", "", wizard.submission?.title || "Create competition entry")
  );
  const close = element("button", "participant-secondary-button", "Close");
  close.type = "button";
  close.addEventListener("click", () => host.replaceChildren());
  heading.append(titleCopy, close);
  shell.append(heading);

  wizard.message = element("p", "participant-wizard-message");
  shell.append(wizard.message);

  const steps = ["Details", "Location", "Images", "Contributors", "Review"];
  const nav = element("nav", "participant-step-nav");
  nav.setAttribute("aria-label", "Submission steps");
  steps.forEach((label, index) => {
    const button = wizardStepButton(label, index, wizard);
    button.classList.toggle("is-active", wizard.step === index);
    if (!wizard.submission && index > 1) button.disabled = true;
    nav.append(button);
  });
  shell.append(nav);

  wizard.form = document.createElement("form");
  wizard.form.className = "participant-wizard-form";
  wizard.form.addEventListener("submit", (event) => event.preventDefault());
  const panel = element("div", "participant-step-panel");
  if (wizard.step === 0) buildDetailsStep(wizard, panel);
  if (wizard.step === 1) buildLocationStep(wizard, panel);
  if (wizard.step === 2) buildImagesStep(wizard, panel);
  if (wizard.step === 3) buildContributorsStep(wizard, panel);
  if (wizard.step === 4) buildReviewStep(wizard, panel);
  wizard.form.append(panel);
  shell.append(wizard.form);

  const footer = element("div", "participant-wizard-footer");
  if (wizard.step > 0) {
    const back = element("button", "participant-secondary-button", "Back");
    back.type = "button";
    back.addEventListener("click", () => { wizard.step -= 1; renderWizard(wizard); });
    footer.append(back);
  }
  if (wizard.step < steps.length - 1) {
    const next = element("button", "competition-primary-action", wizard.step === 1 && !wizard.submission ? "Save draft & continue" : "Save & continue");
    next.type = "button";
    next.addEventListener("click", async () => {
      next.disabled = true;
      try {
        if (wizard.step === 0) {
          const validation = validateDraftPayload(wizard, false);
          if (validation) throw new Error(validation);
          wizard.localDraft = currentDraftPayload(wizard);
          wizard.step += 1;
          renderWizard(wizard);
          return;
        }
        if (wizard.step === 1) {
          if (!wizard.submission) {
            const retained = wizard.localDraft ?? {};
            const location = getLocationFromForm(wizard);
            const fakeForm = wizard.form;
            wizard.form = {
              querySelector(selector) {
                const name = selector.match(/name="([^"]+)"/)?.[1];
                if (name === "title") return { value: retained.title ?? "" };
                if (name === "description") return { value: retained.description ?? "" };
                if (name === "entryType") return { value: retained.entryType ?? "SOLO" };
                if (name === "ownerUuid") return { value: retained.ownerUuid ?? "" };
                if (name === "guildId") return { value: retained.guildId ?? "" };
                if (name === "worldName") return { value: location?.worldName ?? "" };
                if (name === "x") return { value: location?.x ?? "" };
                if (name === "y") return { value: location?.y ?? "" };
                if (name === "z") return { value: location?.z ?? "" };
                if (name === "exactCoordinatesConfirmed") return { checked: Boolean(location?.exactCoordinatesConfirmed) };
                return null;
              }
            };
            try {
              await createDraft(wizard);
            } finally {
              wizard.form = fakeForm;
            }
          } else {
            await saveDraft(wizard);
          }
        } else if (wizard.submission && wizard.step < 2) {
          await saveDraft(wizard);
        }
        wizard.step += 1;
        renderWizard(wizard);
      } catch (error) {
        setWizardMessage(wizard, humanError(error), "is-error");
        next.disabled = false;
      }
    });
    footer.append(next);
  }

  if (wizard.submission && ["DRAFT", "PENDING_REVIEW", "NEEDS_CHANGES", "APPROVED"].includes(wizard.submission.status)
      && ["SUBMISSIONS_OPEN", "REVIEW"].includes(wizard.state.competition.lifecycleState)) {
    const withdraw = element("button", "participant-danger-button participant-withdraw", "Withdraw entry");
    withdraw.type = "button";
    withdraw.addEventListener("click", async () => {
      if (!window.confirm("Withdraw this entry? It will no longer participate in this competition.")) return;
      withdraw.disabled = true;
      try {
        await request(`${API_ROOT}/${encodeURIComponent(wizard.state.slug)}/submissions/${wizard.submission.id}`, {
          method: "POST",
          body: JSON.stringify({ action: "WITHDRAW" })
        });
        await refreshSubmissionList(wizard.state);
        await renderParticipant(wizard.state);
      } catch (error) {
        setWizardMessage(wizard, humanError(error), "is-error");
        withdraw.disabled = false;
      }
    });
    footer.append(withdraw);
  }
  shell.append(footer);
  host.append(shell);
}

async function openWizard(state, listedSubmission) {
  const wizard = { state, submission: null, step: 0, form: null, message: null, localDraft: null };
  if (listedSubmission?.id) {
    try {
      const payload = await request(`${API_ROOT}/${encodeURIComponent(state.slug)}/submissions/${listedSubmission.id}`);
      wizard.submission = payload.submission;
    } catch (error) {
      const host = state.participantPanel.querySelector("#participantWizardHost");
      host?.replaceChildren(element("div", "competition-error", humanError(error)));
      return;
    }
  }
  renderWizard(wizard);
  state.participantPanel.querySelector("#participantWizardHost")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function replaceVotePanel(state) {
  const panel = document.querySelector('[data-tab-panel="vote"]');
  if (!panel) return;
  panel.replaceChildren();
  if (!state.competition.config?.voting?.enabled) {
    panel.append(element("div", "competition-empty", "This competition does not use community voting."));
    return;
  }
  if (state.competition.lifecycleState !== "VOTING") {
    panel.append(element("div", "competition-empty", "Community voting is not open right now."));
    return;
  }
  renderVoting(state, panel);
}

async function renderVoting(state, panel) {
  panel.replaceChildren(element("div", "competition-loading", "Loading your ballot…"));
  let ballot;
  try {
    ballot = await request(`${API_ROOT}/${encodeURIComponent(state.slug)}/vote`);
  } catch (error) {
    const notice = element("div", "competition-error");
    notice.textContent = humanError(error);
    if (error?.payload?.activeMinutes !== undefined && error?.payload?.requiredMinutes !== undefined) {
      notice.append(element("p", "", `Active playtime: ${error.payload.activeMinutes} / ${error.payload.requiredMinutes} minutes required.`));
    }
    panel.replaceChildren(notice);
    return;
  }

  const selected = new Set(ballot.selections ?? []);
  const shell = element("div", "participant-vote-shell");
  const heading = element("div", "participant-section-heading");
  const copy = element("div");
  copy.append(
    element("h2", "", "Community ballot"),
    element("p", "participant-muted", `Choose up to ${ballot.votesPerVoter} different entries. Your selections stay private while voting is open.`)
  );
  heading.append(copy, element("span", "competition-badge", `${ballot.activeMinutes} active min`));
  shell.append(heading);

  const message = element("p", "participant-wizard-message");
  shell.append(message);
  const entries = Array.isArray(state.publicPayload.submissions) ? state.publicPayload.submissions : [];
  const grid = element("div", "participant-vote-grid");
  for (const submission of entries) {
    const label = element("label", "participant-vote-card");
    const checkbox = input("checkbox", `vote-${submission.id}`);
    checkbox.value = submission.id;
    checkbox.checked = selected.has(submission.id);
    const copyBox = element("div");
    copyBox.append(
      element("strong", "", submission.title),
      element("span", "participant-muted", submission.entryType === "GUILD" && submission.guildName ? submission.guildName : submission.ownerName)
    );
    checkbox.addEventListener("change", () => {
      const checked = [...grid.querySelectorAll('input[type="checkbox"]:checked')];
      if (checked.length > ballot.votesPerVoter) {
        checkbox.checked = false;
        message.textContent = `You can choose at most ${ballot.votesPerVoter} entries.`;
        message.className = "participant-wizard-message is-error";
      } else {
        message.textContent = `${checked.length} / ${ballot.votesPerVoter} selected`;
        message.className = "participant-wizard-message";
      }
    });
    label.append(checkbox, copyBox);
    grid.append(label);
  }
  shell.append(grid);

  const save = element("button", "competition-primary-action", ballot.allowChangesUntilClose ? "Save ballot" : "Submit ballot");
  save.type = "button";
  save.addEventListener("click", async () => {
    save.disabled = true;
    const submissionIds = [...grid.querySelectorAll('input[type="checkbox"]:checked')].map((node) => node.value);
    try {
      const result = await request(`${API_ROOT}/${encodeURIComponent(state.slug)}/vote`, {
        method: "POST",
        body: JSON.stringify({ submissionIds })
      });
      selected.clear();
      (result.selections ?? []).forEach((id) => selected.add(id));
      message.textContent = "Ballot saved. You can change it until voting closes.";
      message.className = "participant-wizard-message is-success";
    } catch (error) {
      message.textContent = humanError(error);
      message.className = "participant-wizard-message is-error";
    } finally {
      save.disabled = false;
    }
  });
  shell.append(save);
  panel.replaceChildren(shell);
}

async function loadParticipantState(state) {
  const [meResult, submissionsResult, invitesResult] = await Promise.allSettled([
    request(`${API_ROOT}/${encodeURIComponent(state.slug)}/me`),
    request(`${API_ROOT}/${encodeURIComponent(state.slug)}/submissions`),
    request(`${API_ROOT}/invites`)
  ]);
  if (meResult.status === "fulfilled") state.me = meResult.value;
  else state.authError = meResult.reason;
  state.submissions = submissionsResult.status === "fulfilled" && Array.isArray(submissionsResult.value.submissions)
    ? submissionsResult.value.submissions
    : [];
  state.invites = invitesResult.status === "fulfilled" && Array.isArray(invitesResult.value.invites)
    ? invitesResult.value.invites
    : [];

  if (state.authError && !state.me) {
    const root = state.participantPanel;
    root.replaceChildren(participantHeader(state));
    root.append(element("div", "competition-empty", humanError(state.authError)));
    return;
  }
  await renderParticipant(state);
}

async function initParticipantUI() {
  if (document.body.dataset.competitionPage !== "detail") return;
  const slug = slugFromLocation();
  if (!slug) return;
  const shell = await waitForDetailShell();
  if (!shell) return;

  let publicPayload;
  try {
    publicPayload = await request(`${API_ROOT}/${encodeURIComponent(slug)}`);
  } catch {
    return;
  }
  const state = {
    slug,
    competition: publicPayload.competition,
    publicPayload,
    me: null,
    authError: null,
    submissions: [],
    invites: [],
    participantPanel: null
  };
  addParticipantTab(shell, state);
  replaceVotePanel(state);
  await loadParticipantState(state);
}

initParticipantUI();

export { ApiError, canEditSubmission, humanError, sanitizeImage };
