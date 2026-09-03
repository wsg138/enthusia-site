const API_ROOT = "/api/competitions";

function mediaId(value) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text) ? text : null;
}

function mediaUrl(id) {
  const safe = mediaId(id);
  return safe ? `${API_ROOT}/media/${encodeURIComponent(safe)}` : null;
}

function imageFor(id, className, alt) {
  const url = mediaUrl(id);
  if (!url) return null;
  const image = document.createElement("img");
  image.className = className;
  image.src = url;
  image.alt = alt;
  image.loading = "lazy";
  image.decoding = "async";
  image.referrerPolicy = "same-origin";
  image.addEventListener("error", () => image.remove(), { once: true });
  return image;
}

async function fetchJson(path) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { accept: "application/json" }
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function waitFor(selector, timeoutMs = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = document.querySelector(selector);
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return null;
}

function slugFromLink(link) {
  if (!link?.href) return "";
  try {
    return new URL(link.href, window.location.href).searchParams.get("competition")?.trim().toLowerCase() ?? "";
  } catch {
    return "";
  }
}

function decorateCatalogCard(card, competition) {
  if (!card || card.dataset.appearanceDecorated === "true") return;
  card.dataset.appearanceDecorated = "true";
  const appearance = competition.config?.appearance ?? {};
  const heading = card.querySelector("h3");
  const icon = imageFor(appearance.iconImageId, "competition-title-icon", `${competition.title} icon`);
  if (heading && icon) {
    const row = document.createElement("div");
    row.className = "competition-title-row";
    heading.before(row);
    row.append(icon, heading);
  }
  const categoryArt = imageFor(appearance.categoryImageId, "competition-category-art", `${competition.category} artwork`);
  if (categoryArt) {
    const body = card.querySelector(".competition-card-body") ?? card;
    const meta = body.querySelector(".competition-card-meta");
    if (meta) meta.after(categoryArt);
    else body.prepend(categoryArt);
  }
}

function decorateFeatured(root, competition) {
  const feature = root?.querySelector(".competition-featured");
  if (!feature || feature.dataset.appearanceDecorated === "true") return;
  feature.dataset.appearanceDecorated = "true";
  const appearance = competition.config?.appearance ?? {};
  const heading = feature.querySelector("h2");
  const icon = imageFor(appearance.iconImageId, "competition-title-icon competition-title-icon-featured", `${competition.title} icon`);
  if (heading && icon) {
    const row = document.createElement("div");
    row.className = "competition-title-row";
    heading.before(row);
    row.append(icon, heading);
  }
  const categoryArt = imageFor(appearance.categoryImageId, "competition-featured-category-art", `${competition.category} artwork`);
  const side = feature.querySelector(".competition-featured-side");
  if (side && categoryArt) side.prepend(categoryArt);
}

async function decorateCatalog() {
  const payload = await fetchJson(API_ROOT);
  const competitions = Array.isArray(payload?.competitions) ? payload.competitions : [];
  if (!competitions.length) return;
  await waitFor("#featuredCompetition, .competition-card");

  const bySlug = new Map(competitions.map((competition) => [competition.slug, competition]));
  document.querySelectorAll(".competition-card").forEach((card) => {
    const slug = slugFromLink(card.querySelector(".competition-card-link"));
    const competition = bySlug.get(slug);
    if (competition) decorateCatalogCard(card, competition);
  });

  const featuredRoot = document.querySelector("#featuredCompetition");
  const featuredSlug = slugFromLink(featuredRoot?.querySelector(".competition-primary-action"));
  const featured = bySlug.get(featuredSlug);
  if (featured) decorateFeatured(featuredRoot, featured);
}

function decorateDetail(competition) {
  const hero = document.querySelector(".competition-detail-hero");
  if (!hero || hero.dataset.appearanceDecorated === "true") return false;
  hero.dataset.appearanceDecorated = "true";
  const appearance = competition.config?.appearance ?? {};
  const copy = hero.querySelector(".competition-detail-hero-copy");
  const heading = copy?.querySelector("h1");
  const icon = imageFor(appearance.iconImageId, "competition-title-icon competition-title-icon-detail", `${competition.title} icon`);
  if (heading && icon) {
    const row = document.createElement("div");
    row.className = "competition-title-row";
    heading.before(row);
    row.append(icon, heading);
  }

  const categoryArt = imageFor(appearance.categoryImageId, "competition-detail-category-art", `${competition.category} artwork`);
  if (categoryArt) {
    const frame = document.createElement("div");
    frame.className = "competition-detail-category-art-frame";
    frame.append(categoryArt);
    hero.append(frame);
  }
  return true;
}

async function decorateDetailPage() {
  const slug = new URLSearchParams(window.location.search).get("competition")?.trim().toLowerCase();
  if (!slug) return;
  const payload = await fetchJson(`${API_ROOT}/${encodeURIComponent(slug)}`);
  if (!payload?.competition) return;
  await waitFor(".competition-detail-hero");
  decorateDetail(payload.competition);
}

const mode = document.body.dataset.competitionPage;
if (mode === "catalog") decorateCatalog();
if (mode === "detail") decorateDetailPage();

export { decorateDetail, imageFor, mediaId, mediaUrl };
