import "./competitions-admin-workspace.js";

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

const input = document.querySelector("#bannerMediaInput");
const upload = document.querySelector("#uploadBannerMedia");
const result = document.querySelector("#bannerMediaResult");
const preview = document.querySelector("#bannerMediaPreview");
const previewImage = document.querySelector("#bannerMediaPreviewImage");
const editorMetadata = document.querySelector("#editorMetadata");
const reloadButton = document.querySelector("#reloadCompetition");

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
  if (scaledPixels > MAX_PIXELS) {
    scale *= Math.sqrt(MAX_PIXELS / scaledPixels);
  }
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale))
  };
}

async function sanitizeImage(file) {
  if (!(file instanceof File) || !ACCEPTED_TYPES.has(file.type)) {
    throw new Error("unsupported_image_type");
  }

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

    let blob = await canvasBlob(
      canvas,
      file.type,
      file.type === "image/jpeg" ? 0.95 : undefined
    );

    if (blob.size > MAX_UPLOAD_BYTES && file.type === "image/png") {
      blob = await canvasBlob(canvas, "image/jpeg", 0.95);
    }
    if (blob.size > MAX_UPLOAD_BYTES) throw new Error("image_too_large_after_processing");
    return blob;
  } finally {
    bitmap.close();
  }
}

function setPreview(url) {
  if (!url) {
    preview.hidden = true;
    previewImage.removeAttribute("src");
    return;
  }
  previewImage.src = `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
  preview.hidden = false;
}

async function refreshPreview() {
  const id = selectedCompetitionId();
  if (!id) {
    setPreview(null);
    return;
  }
  try {
    const competition = await currentCompetition(id);
    const bannerId = competition.config?.appearance?.bannerImageId;
    if (!bannerId) {
      setPreview(null);
      return;
    }
    setPreview(`${API_ROOT}/${encodeURIComponent(id)}/media/${encodeURIComponent(bannerId)}`);
  } catch {
    setPreview(null);
  }
}

function errorMessage(code) {
  return ({
    unsupported_image_type: "Choose a PNG or JPEG image.",
    image_too_large: "The processed image is larger than the upload limit.",
    image_too_large_after_processing: "The image is still over 8 MiB after local cleanup. Try a smaller screenshot.",
    image_metadata_not_stripped: "The server still detected embedded metadata. Re-export the image and try again.",
    unsupported_or_invalid_image: "The server could not validate this image.",
    image_blocked_by_moderation: "The automated moderation pass flagged this image. Choose a different banner.",
    image_moderation_unavailable: "The free moderation check is temporarily unavailable. Nothing was stored; try again later.",
    competition_version_conflict: "This competition changed while the image was being prepared. Reload and try again.",
    competition_media_unavailable: "Private competition media storage is not configured in this environment yet."
  })[code] ?? `Unable to upload the banner (${code || "unknown error"}).`;
}

async function uploadBanner() {
  const id = selectedCompetitionId();
  const file = input?.files?.[0];
  if (!id) {
    result.textContent = "Select a competition first.";
    return;
  }
  if (!file) {
    result.textContent = "Choose a PNG or JPEG banner first.";
    return;
  }

  upload.disabled = true;
  input.disabled = true;
  result.textContent = "Removing embedded metadata and preparing the image locally…";

  try {
    const competition = await currentCompetition(id);
    if (competition.lifecycleState !== "DRAFT") throw new Error("competition_media_locked");

    const blob = await sanitizeImage(file);
    result.textContent = "Uploading, validating, and running the free moderation pass…";
    const { response, payload } = await requestJson(`${API_ROOT}/${encodeURIComponent(id)}/media`, {
      method: "POST",
      body: blob,
      headers: {
        "content-type": blob.type,
        "x-competition-version": String(competition.configVersion)
      }
    });

    if (!response.ok) {
      result.textContent = errorMessage(payload.error || `http_${response.status}`);
      if (response.status === 409) reloadButton?.click();
      return;
    }

    input.value = "";
    setPreview(payload.media?.previewUrl ?? null);
    result.textContent = `Banner attached. Competition config is now v${payload.configVersion}.`;
    reloadButton?.click();
  } catch (error) {
    result.textContent = errorMessage(String(error?.message ?? "upload_failed"));
  } finally {
    upload.disabled = false;
    input.disabled = false;
  }
}

upload?.addEventListener("click", uploadBanner);
input?.addEventListener("change", () => {
  result.textContent = input.files?.length ? "Ready to upload. The image will be re-encoded before it leaves your browser." : "";
});

const observer = new MutationObserver(() => refreshPreview());
if (editorMetadata) observer.observe(editorMetadata, { childList: true, subtree: true, characterData: true });
document.querySelector("#competitionList")?.addEventListener("click", () => window.setTimeout(refreshPreview, 0));
reloadButton?.addEventListener("click", () => window.setTimeout(refreshPreview, 0));
refreshPreview();
