const STATUS_REFRESH_INTERVAL_MS = 60000;
const SCREENSHOT_AUTOPLAY_MS = 1500;
const SCREENSHOT_MANUAL_PAUSE_MS = 5000;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isConfiguredValue(value) {
  return Boolean(value) && value.toLowerCase() !== "unavailable";
}

function setExternalLinkTargets(cfg) {
  const linkMap = {
    store: cfg.tebexUrl,
    discord: cfg.discordInvite,
    wiki: cfg.wikiUrl,
    email: cfg.contactEmail ? `mailto:${cfg.contactEmail}` : "",
  };

  document.querySelectorAll("[data-link-target]").forEach((element) => {
    const targetKey = element.getAttribute("data-link-target");
    const href = linkMap[targetKey];
    if (!href || !(element instanceof HTMLAnchorElement)) {
      return;
    }

    element.href = href;
  });
}

function setContactEmail(cfg) {
  const email = normalizeText(cfg.contactEmail);

  document.querySelectorAll("[data-contact-email]").forEach((element) => {
    if (!(element instanceof HTMLAnchorElement) || !email) {
      return;
    }

    element.href = `mailto:${email}`;
    element.textContent = email;
  });
}

function setStatusBadge(statusEl, text, variant) {
  if (!statusEl) {
    return;
  }

  statusEl.textContent = text;
  statusEl.classList.remove("online", "offline", "unknown");
  statusEl.classList.add(variant);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "absolute";
  textArea.style.left = "-9999px";
  document.body.append(textArea);
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
}

function initCopyIpButton(ip) {
  const copyIpBtn = document.getElementById("copyIpBtn");
  if (!copyIpBtn) {
    return;
  }

  const buttonLabel = copyIpBtn.dataset.label || copyIpBtn.textContent || "Copy IP";
  copyIpBtn.dataset.label = buttonLabel;

  copyIpBtn.addEventListener("click", async () => {
    const copyValue = isConfiguredValue(ip) ? ip : "Server IP is currently unavailable";

    try {
      await copyText(copyValue);
      copyIpBtn.textContent = "Copied!";
    } catch {
      copyIpBtn.textContent = "Copy failed";
    }

    window.setTimeout(() => {
      copyIpBtn.textContent = buttonLabel;
    }, 1500);
  });
}

async function updateServerStatus(ip) {
  const ipEl = document.getElementById("serverIp");
  const statusEl = document.getElementById("serverStatus");
  const countEl = document.getElementById("playerCount");

  if (ipEl) {
    ipEl.textContent = isConfiguredValue(ip) ? ip : "Unavailable";
  }

  if (!statusEl || !countEl) {
    return;
  }

  if (!isConfiguredValue(ip)) {
    countEl.textContent = "--";
    setStatusBadge(statusEl, "TBA", "unknown");
    return;
  }

  try {
    const response = await fetch(`https://api.mcstatus.io/v2/status/java/${encodeURIComponent(ip)}`);
    if (!response.ok) {
      throw new Error("Status API returned a non-success response.");
    }

    const data = await response.json();
    if (data?.online) {
      countEl.textContent = typeof data.players?.online === "number" ? String(data.players.online) : "--";
      setStatusBadge(statusEl, "Online", "online");
      return;
    }

    countEl.textContent = "--";
    setStatusBadge(statusEl, "Offline", "offline");
  } catch {
    countEl.textContent = "--";
    setStatusBadge(statusEl, "TBA", "unknown");
  }
}

function createDiscordCard(titleText) {
  const card = document.createElement("section");
  card.className = "discord-card";

  const heading = document.createElement("div");
  heading.className = "discord-head";

  const title = document.createElement("h2");
  title.className = "discord-title";
  title.textContent = titleText;

  heading.append(title);
  card.append(heading);
  return card;
}

function createDiscordLinkButton(href, text) {
  const link = document.createElement("a");
  link.className = "btn ghost";
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = text;
  return link;
}

async function renderDiscordWidget(cfg) {
  const cardRoot = document.getElementById("discordCard");
  const invite = normalizeText(cfg.discordInvite);
  const serverId = normalizeText(cfg.discordServerId);

  if (!cardRoot || !serverId) {
    return;
  }

  const renderFallback = () => {
    cardRoot.replaceChildren();

    const card = createDiscordCard("Discord");
    const message = document.createElement("p");
    message.className = "muted";
    message.textContent = "Live member info is unavailable right now.";

    const actions = document.createElement("div");
    actions.className = "discord-actions";
    actions.append(createDiscordLinkButton(invite, "Open Discord"));

    card.append(message, actions);
    cardRoot.append(card);
  };

  if (!invite) {
    renderFallback();
    return;
  }

  try {
    const response = await fetch(`https://discord.com/api/guilds/${encodeURIComponent(serverId)}/widget.json`, {
      mode: "cors",
    });
    if (!response.ok) {
      throw new Error("Discord widget unavailable.");
    }

    const data = await response.json();
    const members = Array.isArray(data.members) ? data.members.filter((member) => member && member.bot !== true) : [];
    const activeInvite = normalizeText(data.instant_invite) || invite;
    const onlineCount = typeof data.presence_count === "number"
      ? data.presence_count
      : (members.length >= 100 ? "100+" : members.length);

    cardRoot.replaceChildren();

    const card = createDiscordCard("Discord");
    const counts = document.createElement("div");
    counts.className = "discord-counts";

    const countPill = document.createElement("span");
    countPill.className = "pill";

    const dot = document.createElement("span");
    dot.className = "dot";
    dot.setAttribute("aria-hidden", "true");

    countPill.append(dot, document.createTextNode(`${onlineCount} online`));
    counts.append(countPill);
    card.querySelector(".discord-head")?.append(counts);

    const avatars = document.createElement("div");
    avatars.className = "discord-avatars";

    members.slice(0, 20).forEach((member) => {
      const avatarUrl = member.avatar_url || member.avatarURL;
      if (!avatarUrl) {
        return;
      }

      const avatar = document.createElement("img");
      avatar.src = avatarUrl;
      avatar.alt = `${member.nick || member.username || "Discord member"} avatar`;
      avatar.loading = "lazy";
      avatar.decoding = "async";
      avatars.append(avatar);
    });

    if (avatars.childElementCount > 0) {
      card.append(avatars);
    } else {
      const emptyState = document.createElement("p");
      emptyState.className = "muted";
      emptyState.textContent = "No visible members are listed right now.";
      card.append(emptyState);
    }

    const actions = document.createElement("div");
    actions.className = "discord-actions";
    actions.append(createDiscordLinkButton(activeInvite, "Open Discord"));
    card.append(actions);

    cardRoot.append(card);
  } catch {
    renderFallback();
  }
}

function appendRichContent(container, parts) {
  parts.forEach((part) => {
    if (!part || typeof part !== "object") {
      return;
    }

    if (part.type === "link") {
      const link = document.createElement("a");
      link.href = normalizeText(part.href);
      link.textContent = normalizeText(part.label);

      if (/^https?:\/\//i.test(link.href)) {
        link.target = "_blank";
        link.rel = "noopener";
      }

      container.append(link);
      return;
    }

    if (part.type === "text") {
      container.append(document.createTextNode(part.value || ""));
    }
  });
}

function renderFaqItems(items) {
  const faqRoot = document.getElementById("faqList");
  if (!faqRoot || !Array.isArray(items) || items.length === 0) {
    return;
  }

  faqRoot.replaceChildren();

  items.forEach((item) => {
    const details = document.createElement("details");
    details.className = "faq-item card";

    const summary = document.createElement("summary");
    summary.textContent = normalizeText(item.question);

    const answer = document.createElement("p");
    answer.className = "faq-answer";
    appendRichContent(answer, Array.isArray(item.answer) ? item.answer : []);

    details.append(summary, answer);
    faqRoot.append(details);
  });
}

function getRoleClassName(role) {
  const normalizedRole = normalizeText(role).toLowerCase();

  if (normalizedRole === "founder") {
    return "role-founder";
  }

  if (normalizedRole === "admin") {
    return "role-admin";
  }

  if (normalizedRole === "developer") {
    return "role-developer";
  }

  if (normalizedRole === "mod") {
    return "role-mod";
  }

  return "role-default";
}

function createStaffCard(member, hidden = false) {
  const article = document.createElement("article");
  article.className = "staff-card";

  if (hidden) {
    article.setAttribute("aria-hidden", "true");
  }

  const username = normalizeText(member?.username);
  const displayName = normalizeText(member?.name) || username || "Staff";
  const role = normalizeText(member?.role) || "Staff";
  const profileUrl = username ? `https://laby.net/@${encodeURIComponent(username)}` : "";

  const visual = document.createElement(profileUrl ? "a" : "div");
  visual.className = "staff-visual";
  if (visual instanceof HTMLAnchorElement) {
    visual.href = profileUrl;
    visual.target = "_blank";
    visual.rel = "noopener";
    visual.setAttribute("aria-label", `${displayName} profile`);
  }

  const avatar = document.createElement("img");
  avatar.className = "staff-avatar";
  avatar.src = `https://minotar.net/helm/${encodeURIComponent(username || displayName)}/96`;
  avatar.alt = hidden ? "" : `${displayName} Minecraft head`;
  avatar.width = 78;
  avatar.height = 78;
  avatar.loading = "lazy";
  avatar.decoding = "async";

  visual.append(avatar);

  const meta = document.createElement("div");
  meta.className = "staff-meta";

  const name = document.createElement(profileUrl ? "a" : "div");
  name.className = "staff-name";
  name.textContent = displayName;
  if (name instanceof HTMLAnchorElement) {
    name.href = profileUrl;
    name.target = "_blank";
    name.rel = "noopener";
  }

  const roleBadge = document.createElement("div");
  roleBadge.className = "staff-role";
  roleBadge.classList.add(getRoleClassName(role));
  roleBadge.textContent = role;

  meta.append(name, roleBadge);
  article.append(visual, meta);
  return article;
}

function renderStaffCarousel(staff) {
  const shell = document.querySelector(".staff-shell");
  const track = document.getElementById("staffTrack");
  if (!track || !Array.isArray(staff) || staff.length === 0) {
    return;
  }

  track.replaceChildren();

  const visibleMembers = staff.filter((member) => normalizeText(member?.name) || normalizeText(member?.username));
  if (visibleMembers.length === 0) {
    return;
  }
  shell?.classList.remove("staff-view-skins");
  shell?.classList.add("staff-view-heads");

  const primaryGroup = document.createElement("div");
  primaryGroup.className = "staff-group";

  const duplicateGroup = document.createElement("div");
  duplicateGroup.className = "staff-group";
  duplicateGroup.setAttribute("aria-hidden", "true");

  visibleMembers.forEach((member) => {
    primaryGroup.append(createStaffCard(member));
    duplicateGroup.append(createStaffCard(member, true));
  });

  track.append(primaryGroup, duplicateGroup);
  shell?.classList.add("is-ready");
}

function renderWikiCallout(cfg) {
  const wikiNote = document.getElementById("wikiNote");
  if (!wikiNote) {
    return;
  }

  const wikiUrl = normalizeText(cfg.wikiUrl);
  if (!wikiUrl) {
    return;
  }

  wikiNote.replaceChildren();

  const text = document.createElement("p");
  text.className = "wiki-note-text";
  text.append("Want deeper details on mechanics, guides, and server info? Browse the ");

  const link = document.createElement("a");
  link.href = wikiUrl;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Enthusia wiki";

  text.append(link, ".");
  wikiNote.append(text);
}

function renderScreenshotSlideshow(slides) {
  const root = document.getElementById("screenshotSlideshow");
  if (!root || !Array.isArray(slides) || slides.length === 0) {
    return;
  }

  const validSlides = slides.filter((slide) => normalizeText(slide?.src));
  if (validSlides.length === 0) {
    return;
  }

  root.replaceChildren();

  const frame = document.createElement("div");
  frame.className = "slideshow-frame";
  frame.id = "screenshot-slide-frame";

  const image = document.createElement("img");
  image.className = "slideshow-image";
  image.loading = "eager";
  image.decoding = "async";
  image.width = 1600;
  image.height = 900;

  const caption = document.createElement("div");
  caption.className = "slideshow-caption";

  const label = document.createElement("div");
  label.className = "slideshow-label";

  const count = document.createElement("div");
  count.className = "slideshow-count";

  caption.append(label, count);
  frame.append(image, caption);

  const controls = document.createElement("div");
  controls.className = "slideshow-controls";

  const previousPageButton = document.createElement("button");
  previousPageButton.type = "button";
  previousPageButton.className = "slideshow-page-btn";
  previousPageButton.setAttribute("aria-label", "Previous screenshot page");
  previousPageButton.textContent = "<";

  const thumbs = document.createElement("div");
  thumbs.className = "slideshow-thumbs";
  thumbs.setAttribute("role", "tablist");
  thumbs.setAttribute("aria-label", "Screenshot gallery");

  const nextPageButton = document.createElement("button");
  nextPageButton.type = "button";
  nextPageButton.className = "slideshow-page-btn";
  nextPageButton.setAttribute("aria-label", "Next screenshot page");
  nextPageButton.textContent = ">";

  controls.append(previousPageButton, thumbs, nextPageButton);

  let activeIndex = 0;
  let resumeAt = 0;
  let pageIndex = 0;
  const slidesPerPage = 12;
  const totalPages = Math.max(1, Math.ceil(validSlides.length / slidesPerPage));

  const buttons = validSlides.map((slide, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slideshow-thumb";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", "false");
    button.setAttribute("aria-controls", "screenshot-slide-frame");

    const thumb = document.createElement("img");
    thumb.src = slide.src;
    thumb.alt = "";
    thumb.loading = "lazy";
    thumb.decoding = "async";

    const thumbLabel = document.createElement("span");
    thumbLabel.className = "slideshow-thumb-label";
    thumbLabel.textContent = normalizeText(slide.label) || `Screenshot ${index + 1}`;

    button.append(thumb, thumbLabel);
    button.addEventListener("click", () => {
      activeIndex = index;
      resumeAt = Date.now() + SCREENSHOT_MANUAL_PAUSE_MS;
      updateSlide();
    });

    thumbs.append(button);
    return button;
  });

  previousPageButton.addEventListener("click", () => {
    pageIndex = pageIndex > 0 ? pageIndex - 1 : totalPages - 1;
    activeIndex = pageIndex * slidesPerPage;
    resumeAt = 0;
    updateSlide();
  });

  nextPageButton.addEventListener("click", () => {
    pageIndex = pageIndex < totalPages - 1 ? pageIndex + 1 : 0;
    activeIndex = pageIndex * slidesPerPage;
    resumeAt = 0;
    updateSlide();
  });

  function updateThumbPage() {
    const start = pageIndex * slidesPerPage;
    const end = start + slidesPerPage;

    buttons.forEach((button, buttonIndex) => {
      const onCurrentPage = buttonIndex >= start && buttonIndex < end;
      button.hidden = !onCurrentPage;
      button.tabIndex = onCurrentPage ? 0 : -1;
    });

    previousPageButton.hidden = totalPages <= 1;
    nextPageButton.hidden = totalPages <= 1;
  }

  function updateSlide() {
    const slide = validSlides[activeIndex];
    image.src = slide.src;
    image.alt = normalizeText(slide.alt) || normalizeText(slide.label) || `Enthusia screenshot ${activeIndex + 1}`;
    label.textContent = normalizeText(slide.label) || `Screenshot ${activeIndex + 1}`;
    count.textContent = `${activeIndex + 1} / ${validSlides.length}`;

    pageIndex = Math.floor(activeIndex / slidesPerPage);
    updateThumbPage();

    buttons.forEach((button, buttonIndex) => {
      const isActive = buttonIndex === activeIndex;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  updateSlide();
  root.append(frame, controls);

  if (validSlides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  window.setInterval(() => {
    if (Date.now() < resumeAt) {
      return;
    }

    activeIndex = (activeIndex + 1) % validSlides.length;
    updateSlide();
  }, SCREENSHOT_AUTOPLAY_MS);
}

async function initSite(cfg) {
  const yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  const normalizedConfig = {
    serverIp: normalizeText(cfg?.serverIp),
    tebexUrl: normalizeText(cfg?.tebexUrl),
    discordInvite: normalizeText(cfg?.discordInvite),
    discordServerId: normalizeText(cfg?.discordServerId),
    contactEmail: normalizeText(cfg?.contactEmail),
    wikiUrl: normalizeText(cfg?.wikiUrl),
  };

  setExternalLinkTargets(normalizedConfig);
  setContactEmail(normalizedConfig);
  initCopyIpButton(normalizedConfig.serverIp);
  await updateServerStatus(normalizedConfig.serverIp);

  if (document.getElementById("serverStatus") && isConfiguredValue(normalizedConfig.serverIp)) {
    window.setInterval(() => {
      void updateServerStatus(normalizedConfig.serverIp);
    }, STATUS_REFRESH_INTERVAL_MS);
  }

  await renderDiscordWidget(normalizedConfig);
  renderScreenshotSlideshow(cfg?.home?.screenshots);
  renderStaffCarousel(cfg?.home?.staff);
  renderFaqItems(cfg?.home?.faq);
  renderWikiCallout(normalizedConfig);
}

document.addEventListener("DOMContentLoaded", () => {
  void initSite(window.ENTHUSIA || {});
});
