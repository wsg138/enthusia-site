const ROOT = "/api/competitions/admin";
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg"]);
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 8192;
const MAX_PIXELS = 40_000_000;

const toolState = {
  competitionId: null,
  competition: null,
  manualSubmission: null,
  gallerySubmissionId: null
};

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function selectedCompetitionId() {
  return document.querySelector("#competitionList button.is-active[data-competition-id]")?.dataset.competitionId ?? null;
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
  return detail ? `${String(code).replaceAll("_", " ")}: ${detail}` : String(code).replaceAll("_", " ");
}

function field(label, control, hint = "") {
  const wrapper = el("label", "admin-tools-field");
  wrapper.append(el("span", "admin-workspace-label", label), control);
  if (hint) wrapper.append(el("small", "admin-muted", hint));
  return wrapper;
}

function textInput(maxLength, placeholder = "") {
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = maxLength;
  input.placeholder = placeholder;
  return input;
}

function textarea(maxLength, rows, placeholder = "") {
  const input = document.createElement("textarea");
  input.maxLength = maxLength;
  input.rows = rows;
  input.placeholder = placeholder;
  return input;
}

function ensureStyles() {
  if (document.querySelector("[data-competition-admin-tools-styles]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "../../assets/competitions-admin-tools.css?v=1";
  link.dataset.competitionAdminToolsStyles = "true";
  document.head.append(link);
}

function createPanel() {
  const nav = document.querySelector(".competition-editor-nav");
  const content = document.querySelector(".competition-editor-content");
  if (!nav || !content || document.querySelector('[data-admin-tools="true"]')) return null;

  const button = el("button", "", "Staff tools");
  button.type = "button";
  button.dataset.adminTools = "true";
  button.addEventListener("click", async () => {
    nav.querySelectorAll("button").forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
    content.querySelectorAll("[data-editor-panel], [data-workspace-panel], [data-admin-tools-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.adminToolsPanel !== "tools";
      panel.classList.toggle("is-active", panel.dataset.adminToolsPanel === "tools");
    });
    await loadTools();
  });
  nav.append(button);

  const panel = el("section", "editor-section admin-workspace-panel admin-tools-panel");
  panel.dataset.adminToolsPanel = "tools";
  panel.hidden = true;
  const heading = el("div", "editor-section-heading");
  const copy = el("div");
  copy.append(el("p", "admin-eyebrow", "Operations"), el("h3", "", "Staff tools"));
  heading.append(copy);
  const body = el("div", "admin-tools-body");
  panel.append(heading, body);
  content.append(panel);
  return panel;
}

function toolsBody() {
  return document.querySelector('[data-admin-tools-panel="tools"] .admin-tools-body');
}

async function loadSnapshot() {
  const id = selectedCompetitionId();
  if (!id) return null;
  if (toolState.competitionId !== id) {
    toolState.competitionId = id;
    toolState.manualSubmission = null;
    toolState.gallerySubmissionId = null;
  }
  const payload = await api(`${ROOT}/${encodeURIComponent(id)}`);
  toolState.competition = payload.competition;
  return payload.competition;
}

function section(title, description = "") {
  const card = el("section", "admin-tools-card");
  card.append(el("h4", "", title));
  if (description) card.append(el("p", "admin-muted", description));
  return card;
}

function renderDraftDelete(root, competition) {
  if (competition.lifecycleState !== "DRAFT") return;
  const card = section(
    "Delete unpublished draft",
    "Only private drafts can be deleted. A tombstone with the competition identity, deleting staff account, timestamp, and reason remains in D1."
  );
  const reason = textInput(500, "Why is this draft being deleted?");
  const button = el("button", "admin-danger-button", "Delete draft");
  const result = el("p", "admin-form-result");
  button.type = "button";
  button.addEventListener("click", async () => {
    const note = reason.value.trim();
    if (note.length < 3) {
      result.textContent = "Enter a deletion reason of at least 3 characters.";
      return;
    }
    if (!window.confirm(`Delete the unpublished draft “${competition.title}”? This cannot be restored from the competition editor.`)) return;
    button.disabled = true;
    try {
      await api(`${ROOT}/${encodeURIComponent(competition.id)}/delete`, {
        method: "DELETE",
        body: JSON.stringify({ reason: note })
      });
      window.location.reload();
    } catch (error) {
      result.textContent = errorText(error);
      button.disabled = false;
    }
  });
  card.append(field("Deletion reason", reason), button, result);
  root.append(card);
}

function locationControls(competition) {
  if (!competition.config?.entries?.coordinatesRequested) return null;
  const wrap = el("div", "admin-tools-location");
  const world = textInput(128, "world");
  const x = document.createElement("input");
  const y = document.createElement("input");
  const z = document.createElement("input");
  for (const input of [x, y, z]) {
    input.type = "number";
    input.step = "1";
  }
  const confirmed = document.createElement("input");
  confirmed.type = "checkbox";
  const confirmation = el("label", "admin-check");
  confirmation.append(confirmed, document.createTextNode(" I verified these are the exact private coordinates for this entry."));
  const grid = el("div", "admin-tools-grid four-column");
  grid.append(field("World", world), field("X", x), field("Y", y), field("Z", z));
  wrap.append(
    el("div", "admin-inline-alert admin-warning", "Private location: these values are staff-only and must never be copied into public Gallery text, reasons, comments, or screenshots."),
    grid,
    confirmation
  );
  return {
    node: wrap,
    value() {
      if (!world.value.trim() || !confirmed.checked) return undefined;
      const coords = [x, y, z].map((input) => Number(input.value));
      if (!coords.every(Number.isInteger)) return undefined;
      return {
        worldName: world.value.trim(),
        x: coords[0],
        y: coords[1],
        z: coords[2],
        exactCoordinatesConfirmed: true
      };
    }
  };
}

function fittedDimensions(width, height) {
  let scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const scaledPixels = width * height * scale * scale;
  if (scaledPixels > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / scaledPixels);
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale))
  };
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("image_encode_failed")), type, quality);
  });
}

async function sanitizeImage(file) {
  if (!(file instanceof File) || !ACCEPTED_TYPES.has(file.type)) throw new Error("unsupported_image_type");
  const bitmap = await createImageBitmap(file);
  try {
    const dimensions = fittedDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d", { alpha: file.type === "image/png" });
    if (!context) throw new Error("image_canvas_unavailable");
    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
    let blob = await canvasBlob(canvas, file.type, file.type === "image/jpeg" ? 0.92 : undefined);
    if (blob.size > MAX_UPLOAD_BYTES && file.type === "image/jpeg") {
      blob = await canvasBlob(canvas, file.type, 0.82);
    }
    if (blob.size > MAX_UPLOAD_BYTES) throw new Error("image_too_large");
    return blob;
  } finally {
    bitmap.close();
  }
}

function renderManualUpload(card, competition, submission) {
  const uploadWrap = el("div", "admin-tools-upload");
  uploadWrap.append(
    el("strong", "", `Staff-managed entry created for ${submission.ownerName}`),
    el("p", "admin-muted", "Add its screenshots here. Images are re-encoded in the browser to strip ordinary metadata, then server-validated and moderated before private R2 storage.")
  );
  const files = document.createElement("input");
  files.type = "file";
  files.accept = "image/png,image/jpeg";
  files.multiple = true;
  const button = el("button", "button-secondary", "Upload selected images");
  const result = el("p", "admin-form-result");
  button.type = "button";
  button.addEventListener("click", async () => {
    const selected = [...files.files];
    if (!selected.length) {
      result.textContent = "Choose at least one PNG or JPEG.";
      return;
    }
    if (selected.length > competition.config.entries.maxImages) {
      result.textContent = `This competition permits at most ${competition.config.entries.maxImages} images per entry.`;
      return;
    }
    button.disabled = true;
    let revision = toolState.manualSubmission?.revision ?? submission.revision;
    let uploaded = 0;
    try {
      for (const file of selected) {
        result.textContent = `Preparing image ${uploaded + 1} of ${selected.length}…`;
        const blob = await sanitizeImage(file);
        const response = await fetch(
          `${ROOT}/${encodeURIComponent(competition.id)}/submissions/${encodeURIComponent(submission.id)}/images`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              accept: "application/json",
              "content-type": blob.type,
              "x-submission-revision": String(revision)
            },
            body: blob
          }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(payload.error || `HTTP_${response.status}`);
          error.payload = payload;
          throw error;
        }
        revision = payload.revision;
        uploaded += 1;
        toolState.manualSubmission = { ...toolState.manualSubmission, revision };
      }
      result.textContent = `${uploaded} image${uploaded === 1 ? "" : "s"} uploaded. Open Review queue to inspect and approve the entry.`;
      files.value = "";
    } catch (error) {
      result.textContent = `${uploaded} uploaded before error: ${errorText(error)}.`;
    } finally {
      button.disabled = false;
    }
  });
  uploadWrap.append(files, button, result);
  card.append(uploadWrap);
}

function renderManualSubmission(root, competition) {
  if (!["SUBMISSIONS_OPEN", "REVIEW"].includes(competition.lifecycleState)) return;
  const card = section(
    "Create entry for a player",
    "Founder/Admin can create a staff-managed solo entry for a known Minecraft player. It still uses normal entry limits, OpenAI text/image moderation, private coordinate handling, review, results, and reward rules."
  );

  if (!competition.config?.entries?.allowedTypes?.includes("SOLO")) {
    card.append(el("div", "admin-static-field", "Solo entries are disabled for this competition, so staff-created player entries are unavailable."));
    root.append(card);
    return;
  }

  const minecraftName = textInput(16, "Minecraft username");
  const title = textInput(100, "Entry title");
  const maxDescription = Number(competition.config.entries.maxDescriptionChars ?? 10000);
  const description = textarea(maxDescription, 7, "Entry description");
  const coords = locationControls(competition);
  const create = el("button", "button-secondary", "Create staff-managed entry");
  const result = el("p", "admin-form-result");
  create.type = "button";
  create.addEventListener("click", async () => {
    const name = minecraftName.value.trim();
    const entryTitle = title.value.trim();
    const entryDescription = description.value.trim();
    if (!/^[A-Za-z0-9_]{1,16}$/.test(name) || !entryTitle || !entryDescription) {
      result.textContent = "Minecraft name, title, and description are required.";
      return;
    }
    const location = coords?.value();
    if (competition.config.entries.coordinatesRequested && !location) {
      result.textContent = "Enter and confirm the exact private coordinates.";
      return;
    }
    create.disabled = true;
    result.textContent = "Creating and moderating entry…";
    try {
      const payload = await api(`${ROOT}/${encodeURIComponent(competition.id)}/submissions/manual`, {
        method: "POST",
        body: JSON.stringify({ minecraftName: name, title: entryTitle, description: entryDescription, location })
      });
      toolState.manualSubmission = payload.submission;
      result.textContent = `Created ${payload.submission.title} for ${payload.submission.ownerName}.`;
      renderManualUpload(card, competition, payload.submission);
    } catch (error) {
      result.textContent = errorText(error);
      create.disabled = false;
    }
  });

  const grid = el("div", "admin-tools-grid two-column");
  grid.append(field("Minecraft player", minecraftName), field("Entry title", title));
  card.append(grid, field("Description", description));
  if (coords) card.append(coords.node);
  card.append(create, result);
  if (toolState.manualSubmission) renderManualUpload(card, competition, toolState.manualSubmission);
  root.append(card);
}

async function galleryState(competitionId, submissionId) {
  const [detail, promotions] = await Promise.all([
    api(`${ROOT}/${encodeURIComponent(competitionId)}/submissions/${encodeURIComponent(submissionId)}`),
    api(`${ROOT}/${encodeURIComponent(competitionId)}/submissions/${encodeURIComponent(submissionId)}/gallery`)
  ]);
  return { detail, promotions: promotions.promotions ?? [] };
}

async function renderGallerySubmission(card, competition, submissionId) {
  const mount = card.querySelector("[data-gallery-tools]");
  if (!mount) return;
  mount.replaceChildren(el("div", "admin-static-field", "Loading Gallery controls…"));
  try {
    const state = await galleryState(competition.id, submissionId);
    const approvedImages = (state.detail.images ?? []).filter((image) => image.moderationState === "PASSED");
    const activePromotions = (state.promotions ?? []).filter((promotion) => !promotion.removedAt);

    const image = document.createElement("select");
    for (const item of approvedImages) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `Image ${Number(item.sortOrder) + 1}${item.id === state.detail.submission.coverImageId ? " · cover" : ""}`;
      image.append(option);
    }
    const title = textInput(120, "Optional Gallery title");
    const caption = textarea(500, 3, "Optional Gallery caption");
    const promote = el("button", "button-secondary", "Promote selected image");
    const result = el("p", "admin-form-result");
    promote.type = "button";
    promote.disabled = !approvedImages.length;
    promote.addEventListener("click", async () => {
      promote.disabled = true;
      try {
        await api(`${ROOT}/${encodeURIComponent(competition.id)}/submissions/${encodeURIComponent(submissionId)}/gallery`, {
          method: "POST",
          body: JSON.stringify({
            action: "PROMOTE",
            imageId: image.value,
            title: title.value.trim() || null,
            caption: caption.value.trim() || null
          })
        });
        await renderGallerySubmission(card, competition, submissionId);
      } catch (error) {
        result.textContent = errorText(error);
        promote.disabled = false;
      }
    });

    const controls = el("div", "admin-tools-stack");
    controls.append(field("Submission image", image), field("Gallery title", title), field("Gallery caption", caption), promote, result);
    const current = el("div", "admin-tools-promotions");
    current.append(el("strong", "", "Current promotions"));
    if (!activePromotions.length) current.append(el("span", "admin-muted", "No active Gallery promotions from this entry."));
    for (const promotion of activePromotions) {
      const row = el("div", "admin-tools-promotion-row");
      const label = promotion.title || `Image ${Number(promotion.sortOrder) + 1}`;
      row.append(el("span", "", label));
      const remove = el("button", "competition-account-text-button", "Remove");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        remove.disabled = true;
        try {
          await api(`${ROOT}/${encodeURIComponent(competition.id)}/submissions/${encodeURIComponent(submissionId)}/gallery`, {
            method: "POST",
            body: JSON.stringify({ action: "REMOVE", imageId: promotion.imageId })
          });
          await renderGallerySubmission(card, competition, submissionId);
        } catch (error) {
          window.alert(errorText(error));
          remove.disabled = false;
        }
      });
      row.append(remove);
      current.append(row);
    }
    mount.replaceChildren(controls, current);
  } catch (error) {
    mount.replaceChildren(el("div", "admin-inline-alert admin-danger", errorText(error)));
  }
}

async function renderGalleryTools(root, competition) {
  if (!["RESULTS_READY", "COMPLETED", "ARCHIVED"].includes(competition.lifecycleState)) return;
  const card = section(
    "Promote to Community Gallery",
    "Select an approved competition entry and promote individual passed screenshots. Gallery promotion is independent of competition results and can be removed later."
  );
  try {
    const payload = await api(`${ROOT}/${encodeURIComponent(competition.id)}/submissions`);
    const approved = (payload.submissions ?? []).filter((submission) => submission.status === "APPROVED" && !submission.removedAt);
    if (!approved.length) {
      card.append(el("div", "admin-static-field", "No approved entries are available for Gallery promotion."));
      root.append(card);
      return;
    }
    const select = document.createElement("select");
    for (const submission of approved) {
      const option = document.createElement("option");
      option.value = submission.id;
      option.textContent = `${submission.title} · ${submission.ownerName}`;
      select.append(option);
    }
    select.value = approved.some((submission) => submission.id === toolState.gallerySubmissionId)
      ? toolState.gallerySubmissionId
      : approved[0].id;
    toolState.gallerySubmissionId = select.value;
    const mount = el("div", "admin-tools-gallery-detail");
    mount.dataset.galleryTools = "true";
    select.addEventListener("change", () => {
      toolState.gallerySubmissionId = select.value;
      renderGallerySubmission(card, competition, select.value);
    });
    card.append(field("Approved entry", select), mount);
    root.append(card);
    await renderGallerySubmission(card, competition, select.value);
  } catch (error) {
    card.append(el("div", "admin-inline-alert admin-danger", errorText(error)));
    root.append(card);
  }
}

async function loadTools() {
  const body = toolsBody();
  if (!body) return;
  body.replaceChildren(el("div", "admin-static-field", "Loading staff tools…"));
  try {
    const competition = await loadSnapshot();
    if (!competition) {
      body.replaceChildren(el("div", "admin-static-field", "Select a competition first."));
      return;
    }
    const fragment = document.createDocumentFragment();
    renderDraftDelete(fragment, competition);
    renderManualSubmission(fragment, competition);
    await renderGalleryTools(fragment, competition);
    if (!fragment.childNodes.length) {
      fragment.append(el("div", "admin-static-field", "No additional staff tools are needed at this lifecycle stage."));
    }
    body.replaceChildren(fragment);
  } catch (error) {
    body.replaceChildren(el("div", "admin-inline-alert admin-danger", errorText(error)));
  }
}

function observeCompetitionSelection() {
  const list = document.querySelector("#competitionList");
  if (list) {
    new MutationObserver(() => {
      const id = selectedCompetitionId();
      if (id !== toolState.competitionId) {
        toolState.competitionId = id;
        toolState.competition = null;
        toolState.manualSubmission = null;
        toolState.gallerySubmissionId = null;
        const panel = document.querySelector('[data-admin-tools-panel="tools"]');
        if (panel && !panel.hidden) loadTools();
      }
    }).observe(list, { subtree: true, attributes: true, childList: true, attributeFilter: ["class"] });
  }
  document.querySelector("#reloadCompetition")?.addEventListener("click", () => {
    toolState.competition = null;
    const panel = document.querySelector('[data-admin-tools-panel="tools"]');
    if (panel && !panel.hidden) setTimeout(loadTools, 0);
  });
}

function init() {
  ensureStyles();
  createPanel();
  observeCompetitionSelection();
}

init();
