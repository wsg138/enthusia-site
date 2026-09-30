(() => {
  const grid = document.querySelector("#galleryGrid");
  const dialog = document.querySelector("#submissionDialog");
  const form = document.querySelector("#submissionForm");
  const account = document.querySelector("#submissionAccount");
  const status = document.querySelector("#submissionStatus");
  const reviewGrid = document.querySelector("#reviewGrid");
  const labels = {
    COMMUNITY_BUILDS: "Community Builds",
    PVP: "PVP",
    BETA_1: "Beta 1",
    BETA_2: "Beta 2",
    BETA_3: "Beta 3",
    MAPART: "Mapart"
  };
  let session = { authenticated: false, staff: {} };

  function element(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text ?? "");
    return node;
  }

  async function requestJson(path, options) {
    const response = await fetch(path, { credentials: "same-origin", ...options });
    return { response, body: await response.json().catch(() => ({})) };
  }

  function emptyPanel(message, heading) {
    const panel = element("div", "gallery-empty");
    if (heading) panel.append(element("h2", null, heading));
    panel.append(element("p", null, message));
    return panel;
  }

  function showEmpty(category) {
    const categoryName = labels[category] ?? "Gallery";
    grid.replaceChildren(emptyPanel("This section is ready for the first addition.", `No ${categoryName} images yet`));
  }

  function galleryImage(item, sourceField) {
    const image = document.createElement("img");
    image.src = String(item[sourceField] ?? "");
    image.alt = String(item.title ?? "Gallery submission");
    image.loading = "lazy";
    return image;
  }

  function galleryCopy(item, staffView) {
    const copy = element("div", "gallery-entry-copy");
    if (staffView) {
      const categoryName = labels[item.category] ?? "Gallery";
      copy.append(element("p", "eyebrow", `${item.status ?? "UNKNOWN"} · ${categoryName}`));
    }
    copy.append(
      element("h3", null, item.title),
      element("p", null, item.description),
      element("p", "gallery-entry-meta", `${staffView ? "Submitted" : "Shared"} by ${item.submitterDisplayName ?? "Unknown player"}`)
    );
    return copy;
  }

  function publicEntry(item) {
    const entry = element("article", "gallery-entry card");
    entry.append(galleryImage(item, "imageUrl"), galleryCopy(item, false));
    return entry;
  }

  function reviewButton(label, action, submissionId, primary = false) {
    const button = element("button", primary ? "btn btn-primary" : "btn btn-secondary", label);
    button.type = "button";
    button.dataset.review = action;
    button.dataset.id = String(submissionId ?? "");
    return button;
  }

  function reviewEntry(item) {
    const entry = element("article", "gallery-entry card");
    const copy = galleryCopy(item, true);
    const actions = element("div", "review-actions");
    if (item.status === "PENDING") {
      actions.append(
        reviewButton("Approve", "APPROVE", item.id, true),
        reviewButton("Deny", "DENY", item.id)
      );
    }
    if (session.staff?.manage && item.status === "APPROVED") {
      actions.append(
        reviewButton("Edit description", "EDIT_DESCRIPTION", item.id),
        reviewButton("Remove", "REMOVE", item.id)
      );
    }
    copy.append(actions);
    entry.append(galleryImage(item, "previewUrl"), copy);
    return entry;
  }

  async function load(category) {
    grid.replaceChildren(emptyPanel("Loading gallery…"));
    const { response, body } = await requestJson(`/api/gallery/submissions?category=${encodeURIComponent(category)}`);
    if (!response.ok || !body.submissions?.length) {
      showEmpty(category);
      return;
    }
    grid.replaceChildren(...body.submissions.map(publicEntry));
  }

  async function loadSession() {
    ({ body: session } = await requestJson("/api/gallery/session"));
    if (session.authenticated) {
      const name = session.discord?.globalName || session.discord?.username || "Discord user";
      account.replaceChildren("Signed in as ", element("strong", null, name), ".");
    } else {
      const link = element("a", null, "sign in with Discord");
      link.href = "/api/competitions/auth/discord/start?returnTo=%2Fgallery.html";
      account.replaceChildren("You need to ", link, " before submitting.");
    }
    if (session.staff?.review) void loadReview();
  }

  async function loadReview() {
    const { response, body } = await requestJson("/api/gallery/staff/submissions");
    if (!response.ok) return;
    document.querySelector("#staffReview").hidden = false;
    if (!body.submissions?.length) {
      reviewGrid.replaceChildren(emptyPanel("There are no submissions waiting for review."));
      return;
    }
    reviewGrid.replaceChildren(...body.submissions.map(reviewEntry));
  }

  async function submitGalleryEntry(event) {
    event.preventDefault();
    if (!session.authenticated) {
      status.textContent = "Sign in with Discord first.";
      return;
    }
    status.textContent = "Uploading and checking your image…";
    const { response, body } = await requestJson("/api/gallery/submissions", {
      method: "POST",
      body: new FormData(form)
    });
    if (response.ok) {
      form.reset();
      status.textContent = "Submitted. Staff will review it before it appears in the gallery.";
      return;
    }
    status.textContent = `Could not submit: ${body.error || "please try again"}.`;
  }

  async function reviewSubmission(event) {
    const button = event.target.closest("[data-review]");
    if (!button) return;
    const action = button.dataset.review;
    const payload = { action };
    if (action === "DENY" || action === "REMOVE") {
      const note = prompt(action === "DENY" ? "Reason for denial:" : "Reason for removal:");
      if (!note) return;
      payload.note = note;
    }
    if (action === "EDIT_DESCRIPTION") {
      const description = prompt("New description:");
      if (!description) return;
      payload.description = description;
    }
    button.disabled = true;
    const { response } = await requestJson(`/api/gallery/staff/submissions/${encodeURIComponent(button.dataset.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      button.disabled = false;
      return;
    }
    await loadReview();
    await load(document.querySelector(".gallery-tabs button.active").dataset.category);
  }

  document.querySelectorAll(".gallery-tabs button").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll(".gallery-tabs button").forEach((candidate) => {
      candidate.classList.toggle("active", candidate === button);
    });
    void load(button.dataset.category);
  }));
  document.querySelector("#openSubmission").addEventListener("click", () => dialog.showModal());
  document.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  form.addEventListener("submit", submitGalleryEntry);
  reviewGrid.addEventListener("click", reviewSubmission);
  void load("COMMUNITY_BUILDS");
  void loadSession();
})();
