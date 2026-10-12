const API_ROOT = "/api/competitions";

function slugFromLocation() {
  return new URLSearchParams(window.location.search).get("competition")?.trim().toLowerCase() ?? "";
}

function imageList(submission) {
  const images = Array.isArray(submission?.images) ? [...submission.images] : [];
  images.sort((left, right) => {
    const leftCover = left.id === submission?.coverImageId || left.isCover;
    const rightCover = right.id === submission?.coverImageId || right.isCover;
    if (leftCover !== rightCover) return leftCover ? -1 : 1;
    return Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0) || String(left.id).localeCompare(String(right.id));
  });
  return images.filter((image) => typeof image?.url === "string" && image.url.startsWith("/api/competitions/submission-media/"));
}

function installStyles() {
  if (document.querySelector("style[data-competition-public-media]")) return;
  const style = document.createElement("style");
  style.dataset.competitionPublicMedia = "true";
  style.textContent = `
    .competition-entry-media {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 8px;
      margin: 0 0 14px;
    }
    .competition-entry-media button {
      appearance: none;
      border: 0;
      border-radius: 10px;
      padding: 0;
      overflow: hidden;
      background: transparent;
      cursor: zoom-in;
      min-height: 92px;
    }
    .competition-entry-media button:first-child {
      grid-column: span 2;
      grid-row: span 2;
    }
    .competition-entry-media img {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 92px;
      max-height: 240px;
      object-fit: cover;
    }
    .competition-entry-media button:first-child img {
      min-height: 190px;
    }
    .competition-media-dialog {
      width: min(94vw, 1200px);
      max-width: 1200px;
      border: 0;
      border-radius: 14px;
      padding: 0;
      background: #101014;
      color: #fff;
      box-shadow: 0 24px 80px rgb(0 0 0 / .55);
    }
    .competition-media-dialog::backdrop {
      background: rgb(0 0 0 / .82);
    }
    .competition-media-dialog-shell {
      display: grid;
      grid-template-rows: auto 1fr auto;
      max-height: 92vh;
    }
    .competition-media-dialog-header,
    .competition-media-dialog-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 14px;
    }
    .competition-media-dialog-header button,
    .competition-media-dialog-footer button,
    .competition-result-media-button {
      border: 0;
      border-radius: 9px;
      padding: 8px 12px;
      cursor: pointer;
    }
    .competition-media-dialog-image-wrap {
      display: grid;
      place-items: center;
      min-height: 240px;
      overflow: auto;
      background: #09090c;
    }
    .competition-media-dialog-image {
      display: block;
      max-width: 100%;
      max-height: 74vh;
      width: auto;
      height: auto;
      object-fit: contain;
    }
    .competition-result-media-button {
      margin-top: 8px;
    }
    @media (max-width: 600px) {
      .competition-entry-media button:first-child {
        grid-column: span 1;
        grid-row: span 1;
      }
      .competition-entry-media button:first-child img {
        min-height: 120px;
      }
    }
  `;
  document.head.append(style);
}

function createViewer() {
  const existing = document.querySelector("dialog.competition-media-dialog");
  if (existing) return existing._competitionViewer;

  const dialog = document.createElement("dialog");
  dialog.className = "competition-media-dialog";
  dialog.setAttribute("aria-label", "Competition screenshot viewer");

  const shell = document.createElement("div");
  shell.className = "competition-media-dialog-shell";
  const header = document.createElement("div");
  header.className = "competition-media-dialog-header";
  const title = document.createElement("strong");
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.addEventListener("click", () => dialog.close());
  header.append(title, close);

  const imageWrap = document.createElement("div");
  imageWrap.className = "competition-media-dialog-image-wrap";
  const image = document.createElement("img");
  image.className = "competition-media-dialog-image";
  image.decoding = "async";
  imageWrap.append(image);

  const footer = document.createElement("div");
  footer.className = "competition-media-dialog-footer";
  const previous = document.createElement("button");
  previous.type = "button";
  previous.textContent = "← Previous";
  const position = document.createElement("span");
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "Next →";
  footer.append(previous, position, next);

  shell.append(header, imageWrap, footer);
  dialog.append(shell);
  document.body.append(dialog);

  let state = { images: [], index: 0, entryTitle: "Competition entry" };

  function render() {
    const current = state.images[state.index];
    if (!current) return;
    title.textContent = state.entryTitle;
    image.src = current.url;
    image.alt = `${state.entryTitle} screenshot ${state.index + 1} of ${state.images.length}`;
    position.textContent = `${state.index + 1} / ${state.images.length}`;
    previous.disabled = state.index <= 0;
    next.disabled = state.index >= state.images.length - 1;
  }

  previous.addEventListener("click", () => {
    if (state.index <= 0) return;
    state.index -= 1;
    render();
  });
  next.addEventListener("click", () => {
    if (state.index >= state.images.length - 1) return;
    state.index += 1;
    render();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" && state.index > 0) {
      event.preventDefault();
      state.index -= 1;
      render();
    } else if (event.key === "ArrowRight" && state.index < state.images.length - 1) {
      event.preventDefault();
      state.index += 1;
      render();
    }
  });

  const viewer = {
    open(images, index, entryTitle) {
      state = {
        images,
        index: Math.max(0, Math.min(Number(index) || 0, images.length - 1)),
        entryTitle: String(entryTitle || "Competition entry")
      };
      render();
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
  };
  dialog._competitionViewer = viewer;
  return viewer;
}

function mediaGrid(submission, viewer) {
  const images = imageList(submission);
  if (!images.length) return null;
  const grid = document.createElement("div");
  grid.className = "competition-entry-media";
  grid.dataset.submissionMedia = submission.id;
  images.forEach((media, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", `Open ${submission.title} screenshot ${index + 1} of ${images.length}`);
    const image = document.createElement("img");
    image.src = media.url;
    image.alt = `${submission.title} screenshot ${index + 1}`;
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "same-origin";
    button.append(image);
    button.addEventListener("click", () => viewer.open(images, index, submission.title));
    grid.append(button);
  });
  return grid;
}

function enhanceEntries(payload, viewer) {
  const submissions = Array.isArray(payload?.submissions) ? payload.submissions : [];
  const cards = [...document.querySelectorAll('[data-tab-panel="entries"] .submission-card')];
  if (!submissions.length || cards.length !== submissions.length) return false;
  cards.forEach((card, index) => {
    const submission = submissions[index];
    if (!submission || card.querySelector("[data-submission-media]")) return;
    const gallery = mediaGrid(submission, viewer);
    if (gallery) card.prepend(gallery);
    card.dataset.submissionId = submission.id;
  });
  return true;
}

function enhanceResults(payload, viewer) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const submissions = new Map((Array.isArray(payload?.submissions) ? payload.submissions : []).map((item) => [item.id, item]));
  if (!results.length) return true;
  const byPlacement = new Map(results.map((result) => [String(result.placement), result]));
  const cards = [...document.querySelectorAll('[data-tab-panel="results"] [data-placement]')];
  if (!cards.length) return false;
  for (const card of cards) {
    if (card.querySelector(".competition-result-media-button")) continue;
    const result = byPlacement.get(String(card.dataset.placement));
    const submission = result ? submissions.get(result.submissionId) : null;
    const images = imageList(submission);
    if (!submission || !images.length) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "competition-result-media-button";
    button.textContent = images.length === 1 ? "View screenshot" : `View ${images.length} screenshots`;
    button.addEventListener("click", () => viewer.open(images, 0, submission.title));
    card.append(button);
    card.dataset.submissionId = submission.id;
  }
  return true;
}

async function loadPayload(slug) {
  const response = await fetch(`${API_ROOT}/${encodeURIComponent(slug)}`, {
    credentials: "same-origin",
    headers: { accept: "application/json" }
  });
  const payload = await response.json().catch(() => null);
  return response.ok && payload ? payload : null;
}

async function waitForRender(payload, viewer, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const entriesReady = !payload.entriesVisible || enhanceEntries(payload, viewer);
    const resultsReady = enhanceResults(payload, viewer);
    if (entriesReady && resultsReady) return true;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  return false;
}

async function init() {
  if (document.body.dataset.competitionPage !== "detail") return;
  const slug = slugFromLocation();
  if (!slug) return;
  installStyles();
  const payload = await loadPayload(slug);
  if (!payload) return;
  const viewer = createViewer();
  await waitForRender(payload, viewer);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();

export { enhanceEntries, enhanceResults, imageList, mediaGrid };
