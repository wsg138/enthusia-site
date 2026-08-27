import "./competitions-admin-workspace.js?v=2";
import "./competitions-admin-tools.js";
import "./competitions-admin-bootstrap.js";

const workspaceStyles = document.createElement("link");
workspaceStyles.rel = "stylesheet";
workspaceStyles.href = "../../assets/competitions-admin-workspace.css?v=1";
workspaceStyles.dataset.competitionWorkspaceStyles = "true";
if (!document.querySelector("[data-competition-workspace-styles]")) document.head.append(workspaceStyles);

const API_ROOT = "/api/competitions/admin";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 8192;
const MAX_PIXELS = 40_000_000;
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg"]);

const editorMetadata = document.querySelector("#editorMetadata");
const reloadButton = document.querySelector("#reloadCompetition");

const mediaControls = new Map();

function selectedCompetitionId() {
  return document.querySelector("#competitionList button.is-active[data-competition-id]")?.dataset.competitionId ?? null;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      accept: "application/json",
      ...(options.headers ?? {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function currentCompetition(id) {
  const { response, payload } = await requestJson(`${API_ROOT}/${encodeURIComponent(id)}`);
  if (!response.ok || !payload.competition) throw new Error("competition_load_failed");
  return payload.competition;
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("image_encode_failed"));
    }, type, quality);
  });
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

    if (file.type === "image/jpeg") {
      context.fillStyle = "#000";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (dimensions.width !== bitmap.width || dimensions.height !== bitmap.height) {
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
    }
    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);

    let blob = await canvasBlob(canvas, file.type, file.type === "image/jpeg" ? 0.95 : undefined);
    if (blob.size > MAX_UPLOAD_BYTES && file.type === "image/png") blob = await canvasBlob(canvas, "image/jpeg", 0.95);
    if (blob.size > MAX_UPLOAD_BYTES) throw new Error("image_too_large_after_processing");
    return blob;
  } finally {
    bitmap.close();
  }
}

function setPreview(control, url) {
  if (!url) {
    control.preview.hidden = true;
    control.previewImage.removeAttribute("src");
    return;
  }
  control.previewImage.src = `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
  control.preview.hidden = false;
}

function errorMessage(code, label) {
  return ({
    unsupported_image_type: "Choose a PNG or JPEG image.",
    image_too_large: "The processed image is larger than the upload limit.",
    image_too_large_after_processing: "The image is still over 8 MiB after local cleanup. Try a smaller image.",
    image_metadata_not_stripped: "The server still detected embedded metadata. Re-export the image and try again.",
    unsupported_or_invalid_image: "The server could not validate this image.",
    image_blocked_by_moderation: `The automated moderation pass flagged this ${label.toLowerCase()}. Choose a different image.`,
    image_moderation_unavailable: "The free moderation check is temporarily unavailable. Nothing was stored; try again later.",
    competition_version_conflict: "This competition changed while the image was being prepared. Reload and try again.",
    competition_media_unavailable: "Private competition media storage is not configured in this environment yet.",
    competition_media_locked: "Appearance media is locked after the draft is published.",
    invalid_competition_media_purpose: "That appearance media type is not supported."
  })[code] ?? `Unable to upload ${label.toLowerCase()} (${code || "unknown error"}).`;
}

function controlFromExistingBanner() {
  const input = document.querySelector("#bannerMediaInput");
  const button = document.querySelector("#uploadBannerMedia");
  const result = document.querySelector("#bannerMediaResult");
  const preview = document.querySelector("#bannerMediaPreview");
  const previewImage = document.querySelector("#bannerMediaPreviewImage");
  if (!input || !button || !result || !preview || !previewImage) return null;
  return {
    purpose: "banner",
    configField: "bannerImageId",
    label: "Banner / cover image",
    input,
    button,
    result,
    preview,
    previewImage
  };
}

function createAppearanceControl({ purpose, configField, label, description, buttonLabel }) {
  const bannerField = document.querySelector("#bannerMediaField");
  const grid = bannerField?.parentElement;
  if (!grid) return null;

  const field = document.createElement("div");
  field.className = "admin-static-field admin-banner-field";
  field.dataset.appearanceMediaPurpose = purpose;

  const heading = document.createElement("span");
  heading.textContent = label;
  const copy = document.createElement("p");
  copy.textContent = description;
  const preview = document.createElement("div");
  preview.className = "admin-banner-preview";
  preview.hidden = true;
  const previewImage = document.createElement("img");
  previewImage.alt = `Current competition ${label.toLowerCase()} preview`;
  preview.append(previewImage);

  const actions = document.createElement("div");
  actions.className = "admin-banner-actions";
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button-secondary";
  button.textContent = buttonLabel;
  actions.append(input, button);

  const result = document.createElement("p");
  result.className = "admin-form-result";
  result.setAttribute("role", "status");
  field.append(heading, copy, preview, actions, result);
  grid.append(field);

  return { purpose, configField, label, input, button, result, preview, previewImage };
}

function ensureControls() {
  if (mediaControls.size) return;
  const banner = controlFromExistingBanner();
  if (banner) mediaControls.set(banner.purpose, banner);

  const icon = createAppearanceControl({
    purpose: "icon",
    configField: "iconImageId",
    label: "Competition icon",
    description: "Optional compact artwork used beside the competition title and on cards. PNG or JPEG; the same metadata stripping, validation, and moderation rules apply.",
    buttonLabel: "Upload & attach icon"
  });
  if (icon) mediaControls.set(icon.purpose, icon);

  const category = createAppearanceControl({
    purpose: "category",
    configField: "categoryImageId",
    label: "Category artwork",
    description: "Optional supporting artwork for the competition category/theme. It remains separate from the wide banner and uses the same private moderated media pipeline.",
    buttonLabel: "Upload category artwork"
  });
  if (category) mediaControls.set(category.purpose, category);
}

async function refreshPreviews() {
  ensureControls();
  const id = selectedCompetitionId();
  if (!id) {
    mediaControls.forEach((control) => setPreview(control, null));
    return;
  }
  try {
    const competition = await currentCompetition(id);
    for (const control of mediaControls.values()) {
      const mediaId = competition.config?.appearance?.[control.configField];
      setPreview(control, mediaId ? `${API_ROOT}/${encodeURIComponent(id)}/media/${encodeURIComponent(mediaId)}` : null);
    }
  } catch {
    mediaControls.forEach((control) => setPreview(control, null));
  }
}

async function uploadAppearance(control) {
  const id = selectedCompetitionId();
  const file = control.input?.files?.[0];
  if (!id) {
    control.result.textContent = "Select a competition first.";
    return;
  }
  if (!file) {
    control.result.textContent = `Choose a PNG or JPEG ${control.label.toLowerCase()} first.`;
    return;
  }

  control.button.disabled = true;
  control.input.disabled = true;
  control.result.textContent = "Removing embedded metadata and preparing the image locally…";

  try {
    const competition = await currentCompetition(id);
    if (competition.lifecycleState !== "DRAFT") throw new Error("competition_media_locked");

    const blob = await sanitizeImage(file);
    control.result.textContent = "Uploading, validating, and running the free moderation pass…";
    const { response, payload } = await requestJson(`${API_ROOT}/${encodeURIComponent(id)}/media`, {
      method: "POST",
      body: blob,
      headers: {
        "content-type": blob.type,
        "x-competition-version": String(competition.configVersion),
        "x-competition-media-purpose": control.purpose
      }
    });

    if (!response.ok) {
      control.result.textContent = errorMessage(payload.error || `http_${response.status}`, control.label);
      if (response.status === 409) reloadButton?.click();
      return;
    }

    control.input.value = "";
    setPreview(control, payload.media?.previewUrl ?? null);
    control.result.textContent = `${control.label} attached. Competition config is now v${payload.configVersion}.`;
    reloadButton?.click();
  } catch (error) {
    control.result.textContent = errorMessage(String(error?.message ?? "upload_failed"), control.label);
  } finally {
    control.button.disabled = false;
    control.input.disabled = false;
  }
}

function bindControls() {
  ensureControls();
  for (const control of mediaControls.values()) {
    if (control.button.dataset.appearanceMediaBound === "true") continue;
    control.button.dataset.appearanceMediaBound = "true";
    control.button.addEventListener("click", () => uploadAppearance(control));
    control.input.addEventListener("change", () => {
      control.result.textContent = control.input.files?.length
        ? "Ready to upload. The image will be re-encoded before it leaves your browser."
        : "";
    });
  }
}

bindControls();
const observer = new MutationObserver(() => refreshPreviews());
if (editorMetadata) observer.observe(editorMetadata, { childList: true, subtree: true, characterData: true });
document.querySelector("#competitionList")?.addEventListener("click", () => window.setTimeout(refreshPreviews, 0));
reloadButton?.addEventListener("click", () => window.setTimeout(refreshPreviews, 0));
refreshPreviews();
