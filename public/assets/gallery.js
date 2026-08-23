(() => {
  const grid = document.querySelector("#galleryGrid");
  const dialog = document.querySelector("#submissionDialog");
  const form = document.querySelector("#submissionForm");
  const account = document.querySelector("#submissionAccount");
  const status = document.querySelector("#submissionStatus");
  let session = { authenticated: false, staff: {} };
  const labels = { COMMUNITY_BUILDS: "Community Builds", PVP: "PVP", BETA_1: "Beta 1", BETA_2: "Beta 2", BETA_3: "Beta 3", MAPART: "Mapart" };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  async function get(url, options) { const response = await fetch(url, { credentials: "same-origin", ...options }); return { response, body: await response.json().catch(() => ({})) }; }
  function empty(category) { grid.innerHTML = `<div class="gallery-empty"><h2>No ${esc(labels[category])} images yet</h2><p>This section is ready for the first addition.</p></div>`; }
  async function load(category) {
    grid.innerHTML = '<div class="gallery-empty"><p>Loading gallery…</p></div>';
    const { response, body } = await get(`/api/gallery/submissions?category=${category}`);
    if (!response.ok || !body.submissions?.length) return empty(category);
    grid.innerHTML = body.submissions.map((item) => `<article class="gallery-entry card"><img src="${esc(item.imageUrl)}" alt="${esc(item.title)}" loading="lazy"><div class="gallery-entry-copy"><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p><p class="gallery-entry-meta">Shared by ${esc(item.submitterDisplayName)}</p></div></article>`).join("");
  }
  async function loadSession() {
    ({ body: session } = await get("/api/gallery/session"));
    account.innerHTML = session.authenticated ? `Signed in as <strong>${esc(session.discord.globalName || session.discord.username)}</strong>.` : `You need to <a href="/api/competitions/auth/discord/start?returnTo=%2Fgallery.html">sign in with Discord</a> before submitting.`;
    if (session.staff?.review) loadReview();
  }
  async function loadReview() {
    const { response, body } = await get("/api/gallery/staff/submissions");
    if (!response.ok) return;
    const section = document.querySelector("#staffReview"), review = document.querySelector("#reviewGrid"); section.hidden = false;
    if (!body.submissions?.length) { review.innerHTML = '<div class="gallery-empty"><p>There are no submissions waiting for review.</p></div>'; return; }
    review.innerHTML = body.submissions.map((item) => `<article class="gallery-entry card"><img src="${esc(item.previewUrl)}" alt="${esc(item.title)}"><div class="gallery-entry-copy"><p class="eyebrow">${esc(item.status)} · ${esc(labels[item.category])}</p><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p><p class="gallery-entry-meta">Submitted by ${esc(item.submitterDisplayName)}</p><div class="review-actions">${item.status === "PENDING" ? `<button class="btn btn-primary" data-review="APPROVE" data-id="${item.id}">Approve</button><button class="btn btn-secondary" data-review="DENY" data-id="${item.id}">Deny</button>` : ""}${session.staff.manage && item.status === "APPROVED" ? `<button class="btn btn-secondary" data-review="EDIT_DESCRIPTION" data-id="${item.id}">Edit description</button><button class="btn btn-secondary" data-review="REMOVE" data-id="${item.id}">Remove</button>` : ""}</div></div></article>`).join("");
  }
  document.querySelectorAll(".gallery-tabs button").forEach((button) => button.addEventListener("click", () => { document.querySelectorAll(".gallery-tabs button").forEach((b) => b.classList.toggle("active", b === button)); load(button.dataset.category); }));
  document.querySelector("#openSubmission").addEventListener("click", () => dialog.showModal()); document.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  form.addEventListener("submit", async (event) => { event.preventDefault(); if (!session.authenticated) { status.textContent = "Sign in with Discord first."; return; } status.textContent = "Uploading and checking your image…"; const { response, body } = await get("/api/gallery/submissions", { method: "POST", body: new FormData(form) }); if (response.ok) { form.reset(); status.textContent = "Submitted. Staff will review it before it appears in the gallery."; } else status.textContent = `Could not submit: ${body.error || "please try again"}.`; });
  document.querySelector("#reviewGrid").addEventListener("click", async (event) => { const button = event.target.closest("[data-review]"); if (!button) return; const action = button.dataset.review; let payload = { action }; if (action === "DENY" || action === "REMOVE") { const note = prompt(action === "DENY" ? "Reason for denial:" : "Reason for removal:"); if (!note) return; payload.note = note; } if (action === "EDIT_DESCRIPTION") { const description = prompt("New description:"); if (!description) return; payload.description = description; } button.disabled = true; const { response } = await get(`/api/gallery/staff/submissions/${button.dataset.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); if (response.ok) { await loadReview(); await load(document.querySelector(".gallery-tabs button.active").dataset.category); } else button.disabled = false; });
  load("COMMUNITY_BUILDS"); loadSession();
})();
