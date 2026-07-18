const STATUS_REFRESH_INTERVAL_MS = 60000;
const SCREENSHOT_AUTOPLAY_MS = 3000;
const SCREENSHOT_MANUAL_PAUSE_MS = 7000;
const STAFF_SCROLL_SPEED_PX_PER_SECOND = 28;

let stopStaffCarouselMotion = null;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function pickText() {
  const values = Array.prototype.slice.call(arguments);
  for (const value of values) {
    const text = normalizeText(value);
    if (text) {
      return text;
    }
  }

  return "";
}

function pickNumber() {
  const values = Array.prototype.slice.call(arguments);
  for (const value of values) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    const number = Number(value);
    if (isFinite(number)) {
      return number;
    }
  }

  return null;
}

function pickArray() {
  const values = Array.prototype.slice.call(arguments);
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function isConfiguredValue(value) {
  return Boolean(value) && value.toLowerCase() !== "unavailable";
}

function setExternalLinkTargets(cfg) {
  document.querySelectorAll("[data-link-target]").forEach((element) => {
    const targetKey = element.getAttribute("data-link-target");
    const href = getConfiguredLinkHref(cfg, targetKey);
    if (!href || !(element instanceof HTMLAnchorElement)) {
      return;
    }

    element.href = href;
  });
  return true;
}

function getConfiguredLinkHref(cfg, targetKey) {
  switch (targetKey) {
    case "store":
      return cfg.tebexUrl;
    case "discord":
      return cfg.discordInvite;
    case "wiki":
      return cfg.wikiUrl;
    case "email":
      return cfg.contactEmail ? `mailto:${cfg.contactEmail}` : "";
    default:
      return "";
  }
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
  return true;
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
  const copyButtons = [...document.querySelectorAll("#copyIpBtn, #copyIpMiniBtn, [data-copy-server-ip]")];
  if (!copyButtons.length) {
    return;
  }

  copyButtons.forEach((copyIpBtn) => {
    const buttonLabel = copyIpBtn.dataset.label || copyIpBtn.textContent || "Copy IP";
    copyIpBtn.dataset.label = buttonLabel;

    copyIpBtn.addEventListener("click", async () => {
      const copyValue = isConfiguredValue(ip) ? ip : "Server IP is currently unavailable";

      try {
        await copyText(copyValue);
        copyIpBtn.textContent = "Copied";
      } catch {
        copyIpBtn.textContent = "Copy failed";
      }

      window.setTimeout(() => {
        copyIpBtn.textContent = buttonLabel;
      }, 1500);
    });
  });
}

async function updateServerStatus(ip) {
  const ipEl = document.getElementById("serverIp");
  const statusEl = document.getElementById("serverStatus");
  const countEl = document.getElementById("playerCount");
  const updatedEl = document.getElementById("statusUpdated");

  if (ipEl) {
    ipEl.textContent = isConfiguredValue(ip) ? ip : "Unavailable";
  }

  if (!statusEl || !countEl) {
    return;
  }

  if (!isConfiguredValue(ip)) {
    countEl.textContent = "--";
    setStatusBadge(statusEl, "TBA", "unknown");
    if (updatedEl) updatedEl.textContent = "Server address is unavailable";
    return;
  }

  try {
    const startedAt = performance.now();
    applyServerStatus(await fetchServerStatus(ip), statusEl, countEl);
    const latency = Math.max(1, Math.round(performance.now() - startedAt));
    if (updatedEl) updatedEl.textContent = `Updated just now · ${latency} ms status check`;
  } catch {
    countEl.textContent = "--";
    setStatusBadge(statusEl, "TBA", "unknown");
    if (updatedEl) updatedEl.textContent = "Live status is temporarily unavailable";
  }
}

function initStatusRefresh(ip) {
  const refreshButton = document.getElementById("refreshStatusBtn");
  const statusMeta = refreshButton?.closest(".status-meta");
  const statusGrid = document.querySelector(".live-status");
  if (!refreshButton) return;

  refreshButton.addEventListener("click", async () => {
    refreshButton.disabled = true;
    refreshButton.textContent = "Refreshing…";
    statusMeta?.classList.remove("is-refreshed");
    statusMeta?.classList.add("is-refreshing");
    statusGrid?.classList.add("is-refreshing");
    await Promise.all([
      updateServerStatus(ip),
      new Promise((resolve) => window.setTimeout(resolve, 700))
    ]);
    statusMeta?.classList.remove("is-refreshing");
    statusMeta?.classList.add("is-refreshed");
    statusGrid?.classList.remove("is-refreshing");
    statusGrid?.classList.add("is-refreshed");
    refreshButton.disabled = false;
    refreshButton.textContent = "Refresh";
    window.setTimeout(() => {
      statusMeta?.classList.remove("is-refreshed");
      statusGrid?.classList.remove("is-refreshed");
    }, 650);
  });
}

function initShareButton(cfg) {
  const shareButton = document.getElementById("shareServerBtn");
  if (!shareButton) return;

  shareButton.addEventListener("click", async () => {
    const originalLabel = shareButton.textContent;
    const shareData = {
      title: "Enthusia SMP",
      text: `Join Enthusia SMP on ${cfg.serverIp}`,
      url: window.location.href
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await copyText(`${shareData.text} — ${shareData.url}`);
        shareButton.textContent = "Link copied";
      }
    } catch (error) {
      if (error?.name !== "AbortError") shareButton.textContent = "Share failed";
    }

    window.setTimeout(() => { shareButton.textContent = originalLabel; }, 1800);
  });
}

function initMobileNavigation() {
  const header = document.querySelector(".header-inner");
  const nav = header?.querySelector(".nav");
  const brand = header?.querySelector(".brand");
  if (!header || !nav || !brand) return;

  const mobileQuery = window.matchMedia("(max-width: 780px)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const toggle = document.createElement("button");
  toggle.className = "nav-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "mobile-navigation");
  toggle.setAttribute("aria-label", "Open navigation");
  toggle.innerHTML = "<span></span><span></span><span></span>";
  brand.after(toggle);
  header.classList.add("nav-enhanced");

  const overlay = document.createElement("div");
  overlay.id = "mobile-navigation";
  overlay.className = "mobile-nav-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Site navigation");

  const panel = document.createElement("div");
  panel.className = "mobile-nav-panel";

  const mainPanel = document.createElement("div");
  mainPanel.className = "mobile-nav-view mobile-nav-main";
  mainPanel.setAttribute("aria-label", "Main menu");
  const mainTitle = document.createElement("p");
  mainTitle.className = "mobile-nav-kicker";
  mainTitle.textContent = "Menu";
  const mainLinks = document.createElement("div");
  mainLinks.className = "mobile-nav-links";
  const externalActions = document.createElement("div");
  externalActions.className = "mobile-nav-external-actions";
  externalActions.setAttribute("aria-label", "External links");

  const communityPanel = document.createElement("div");
  communityPanel.className = "mobile-nav-view mobile-nav-community";
  communityPanel.setAttribute("aria-label", "Community menu");
  communityPanel.hidden = true;
  const backButton = document.createElement("button");
  backButton.className = "mobile-nav-back";
  backButton.type = "button";
  backButton.textContent = "← Menu";
  const communityTitle = document.createElement("p");
  communityTitle.className = "mobile-nav-kicker";
  communityTitle.textContent = "Community";
  const communityLinks = document.createElement("div");
  communityLinks.className = "mobile-nav-community-grid";

  const cloneLink = (link) => {
    const clone = link.cloneNode(true);
    clone.removeAttribute("id");
    clone.classList.remove("desktop-external-link", "desktop-wiki-external");
    clone.querySelector(".desktop-external-label")?.remove();
    return clone;
  };

  [...nav.children].forEach((item) => {
    if (item.matches("a")) {
      const clonedLink = cloneLink(item);
      const target = item.dataset.linkTarget;
      if (target === "store" || target === "discord") {
        clonedLink.classList.add(`mobile-nav-${target}`);
        const externalLabel = document.createElement("small");
        externalLabel.textContent = "External ↗";
        clonedLink.append(externalLabel);
        externalActions.append(clonedLink);
      } else {
        mainLinks.append(clonedLink);
      }
      return;
    }
    if (!item.matches(".nav-dropdown")) return;
    const communityButton = document.createElement("button");
    communityButton.className = "mobile-nav-community-trigger";
    communityButton.type = "button";
    communityButton.setAttribute("aria-expanded", "false");
    communityButton.innerHTML = "Community <small>More pages ›</small>";
    mainLinks.append(communityButton);
    item.querySelectorAll(".nav-menu a").forEach((link) => {
      const clonedLink = cloneLink(link);
      if (link.dataset.linkTarget === "wiki") {
        clonedLink.classList.add("mobile-nav-wiki-external");
        const externalLabel = document.createElement("small");
        externalLabel.textContent = "External ↗";
        clonedLink.append(externalLabel);
      }
      communityLinks.append(clonedLink);
    });
  });

  mainPanel.append(mainTitle, mainLinks, externalActions);
  communityPanel.append(backButton, communityTitle, communityLinks);
  panel.append(mainPanel, communityPanel);
  overlay.append(panel);
  document.body.append(overlay);

  const communityButton = mainLinks.querySelector(".mobile-nav-community-trigger");
  let lockedScrollY = 0;
  let closeTimer = 0;
  let isOpen = false;
  const backgroundTargets = [
    document.querySelector("main"),
    document.querySelector(".site-footer"),
    document.querySelector(".mobile-join-bar"),
    brand,
    nav
  ].filter(Boolean);

  const activePanel = () => communityPanel.hidden ? mainPanel : communityPanel;
  const focusableItems = () => [...activePanel().querySelectorAll("a[href],button:not([disabled])")].filter((item) => !item.hidden);
  const showMainPanel = (focus = false) => {
    communityPanel.hidden = true;
    mainPanel.hidden = false;
    communityButton?.setAttribute("aria-expanded", "false");
    if (focus) communityButton?.focus();
  };
  const showCommunityPanel = () => {
    mainPanel.hidden = true;
    communityPanel.hidden = false;
    communityButton?.setAttribute("aria-expanded", "true");
    backButton.focus();
  };

  const unlockPage = () => {
    backgroundTargets.forEach((target) => { target.inert = false; });
    document.documentElement.classList.remove("mobile-nav-locked");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    window.scrollTo(0, lockedScrollY);
  };

  const closeMenu = ({ restoreFocus = true, immediate = false } = {}) => {
    if (!isOpen) return;
    isOpen = false;
    window.clearTimeout(closeTimer);
    overlay.classList.remove("is-open");
    header.classList.remove("nav-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation");
    unlockPage();
    showMainPanel();
    const finish = () => {
      overlay.hidden = true;
      if (restoreFocus && document.contains(toggle)) toggle.focus();
    };
    if (immediate || reducedMotion) finish();
    else closeTimer = window.setTimeout(finish, 160);
  };

  const openMenu = () => {
    if (isOpen || !mobileQuery.matches) return;
    isOpen = true;
    window.clearTimeout(closeTimer);
    lockedScrollY = window.scrollY;
    backgroundTargets.forEach((target) => { target.inert = true; });
    document.body.style.position = "fixed";
    document.body.style.top = `-${lockedScrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.documentElement.classList.add("mobile-nav-locked");
    overlay.hidden = false;
    header.classList.add("nav-open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close navigation");
    requestAnimationFrame(() => overlay.classList.add("is-open"));
    const firstItem = focusableItems()[0];
    firstItem?.focus();
  };

  toggle.addEventListener("click", () => isOpen ? closeMenu() : openMenu());
  communityButton?.addEventListener("click", showCommunityPanel);
  backButton.addEventListener("click", () => showMainPanel(true));
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeMenu();
    if (event.target.closest("a")) closeMenu({ restoreFocus: false, immediate: true });
  });
  document.addEventListener("keydown", (event) => {
    if (!isOpen) return;
    if (event.key === "Escape") {
      closeMenu();
      return;
    }
    if (event.key !== "Tab") return;
    const items = [toggle, ...focusableItems()];
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  window.addEventListener("popstate", () => closeMenu({ restoreFocus: false, immediate: true }));
  window.addEventListener("pagehide", () => closeMenu({ restoreFocus: false, immediate: true }));
  mobileQuery.addEventListener("change", (event) => {
    if (!event.matches) closeMenu({ restoreFocus: false, immediate: true });
  });
}

function initDesktopDropdownGrace() {
  const desktopPointerQuery = window.matchMedia("(min-width: 781px) and (hover: hover)");

  document.querySelectorAll(".nav-dropdown").forEach((dropdown) => {
    let closeTimer = 0;
    const cancelClose = () => window.clearTimeout(closeTimer);
    const openMenu = () => {
      if (!desktopPointerQuery.matches) return;
      cancelClose();
      dropdown.classList.add("is-open");
    };
    const scheduleClose = () => {
      cancelClose();
      closeTimer = window.setTimeout(() => dropdown.classList.remove("is-open"), 180);
    };

    dropdown.addEventListener("pointerenter", openMenu);
    dropdown.addEventListener("pointerleave", scheduleClose);
    desktopPointerQuery.addEventListener("change", (event) => {
      if (!event.matches) {
        cancelClose();
        dropdown.classList.remove("is-open");
      }
    });
  });
}

function initDesktopExternalNavigation() {
  const nav = document.querySelector(".site-header .nav");
  if (!nav) return;

  nav.querySelectorAll(":scope > a[data-link-target='store'], :scope > a[data-link-target='discord']").forEach((link) => {
    link.classList.add("desktop-external-link");
    if (!link.querySelector(".desktop-external-label")) {
      const label = document.createElement("small");
      label.className = "desktop-external-label";
      label.textContent = "External ↗";
      link.append(label);
    }
  });

  const wiki = nav.querySelector(".nav-menu a[data-link-target='wiki']");
  if (wiki && !wiki.querySelector(".desktop-external-label")) {
    wiki.classList.add("desktop-wiki-external");
    const label = document.createElement("small");
    label.className = "desktop-external-label";
    label.textContent = "External ↗";
    wiki.append(label);
  }
}

async function fetchServerStatus(ip) {
  const response = await fetch(`https://api.mcstatus.io/v2/status/java/${encodeURIComponent(ip)}`);
  if (!response.ok) {
    throw new Error("Status API returned a non-success response.");
  }

  return response.json();
}

function applyServerStatus(data, statusEl, countEl) {
  if (!data?.online) {
    countEl.textContent = "--";
    setStatusBadge(statusEl, "Offline", "offline");
    return;
  }

  const online = typeof data.players?.online === "number" ? data.players.online : null;
  countEl.textContent = online === null ? "--" : String(online);
  setStatusBadge(statusEl, "Online", "online");
}

function createDiscordCard(titleText) {
  const card = document.createElement("section");
  card.className = "discord-card";

  const heading = document.createElement("div");
  heading.className = "discord-head";

  const headingCopy = document.createElement("div");
  const kicker = document.createElement("p");
  kicker.className = "discord-kicker";
  kicker.textContent = "Community hub";

  const title = document.createElement("h2");
  title.className = "discord-title";
  title.textContent = titleText;

  headingCopy.append(kicker, title);
  heading.append(headingCopy);
  const summary = document.createElement("p");
  summary.className = "discord-summary";
  summary.textContent = "Announcements, conversation, and a quick way to find people playing.";

  card.append(heading, summary);
  return card;
}

function createDiscordLinkButton(href, text) {
  const link = document.createElement("a");
  link.className = "discord-join";
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = text;
  return link;
}

function renderDiscordFallback(cardRoot, invite) {
  cardRoot.replaceChildren();

  const card = createDiscordCard("Discord");
  const message = document.createElement("p");
  message.className = "muted";
  message.textContent = "Live member info is unavailable right now.";

  const actions = document.createElement("div");
  actions.className = "discord-actions";
    actions.append(createDiscordLinkButton(invite, "Join Discord"));

  card.append(message, actions);
  cardRoot.append(card);
}

function appendDiscordAvatars(card, members) {
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
    return;
  }

  const emptyState = document.createElement("p");
  emptyState.className = "muted";
  emptyState.textContent = "Members are not visible right now.";
  card.append(emptyState);
}

function createDiscordCountPill(onlineCount) {
  const counts = document.createElement("div");
  counts.className = "discord-counts";

  const countPill = document.createElement("span");
  countPill.className = "pill";

  const dot = document.createElement("span");
  dot.className = "dot";
  dot.setAttribute("aria-hidden", "true");

  countPill.append(dot, document.createTextNode(`${onlineCount} online`));
  counts.append(countPill);
  return counts;
}

async function renderDiscordWidget(cfg) {
  const cardRoot = document.getElementById("discordCard");
  const invite = normalizeText(cfg.discordInvite);
  const serverId = normalizeText(cfg.discordServerId);

  if (!cardRoot || !serverId) {
    return;
  }

  if (!invite) {
    renderDiscordFallback(cardRoot, invite);
    return;
  }

  try {
    const response = await fetch(`https://discord.com/api/guilds/${encodeURIComponent(serverId)}/widget.json`, {
      mode: "cors"
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
    card.querySelector(".discord-head")?.append(createDiscordCountPill(onlineCount));
    appendDiscordAvatars(card, members);

    const actions = document.createElement("div");
    actions.className = "discord-actions";
    actions.append(createDiscordLinkButton(activeInvite, "Join Discord"));
    card.append(actions);

    cardRoot.append(card);
  } catch {
    renderDiscordFallback(cardRoot, invite);
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

function getStaffIdentity(member) {
  const username = normalizeText(member?.username);
  const displayName = normalizeText(member?.name) || username || "Staff";
  const role = normalizeText(member?.role) || "Staff";
  return { username, displayName, role };
}

function createStaffVisual(identity, hidden) {
  const { username, displayName } = identity;
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
  return { visual, profileUrl };
}

function createStaffMeta(identity, profileUrl) {
  const meta = document.createElement("div");
  meta.className = "staff-meta";

  const name = document.createElement(profileUrl ? "a" : "div");
  name.className = "staff-name";
  name.textContent = identity.displayName;
  if (name instanceof HTMLAnchorElement) {
    name.href = profileUrl;
    name.target = "_blank";
    name.rel = "noopener";
  }

  const roleBadge = document.createElement("div");
  roleBadge.className = "staff-role";
  roleBadge.classList.add(getRoleClassName(identity.role));
  roleBadge.textContent = identity.role;

  meta.append(name, roleBadge);
  return meta;
}

function createStaffCard(member, hidden = false) {
  const article = document.createElement("article");
  article.className = "staff-card";

  if (hidden) {
    article.setAttribute("aria-hidden", "true");
  }

  const identity = getStaffIdentity(member);
  const { visual, profileUrl } = createStaffVisual(identity, hidden);
  const meta = createStaffMeta(identity, profileUrl);
  article.append(visual, meta);
  return article;
}

function initStaffCarouselMotion(shell, track) {
  stopStaffCarouselMotion?.();

  const primaryGroup = track.querySelector(".staff-group");
  if (!shell || !track || !primaryGroup) {
    return;
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) {
    track.style.transform = "translate3d(0, 0, 0)";
    stopStaffCarouselMotion = null;
    return;
  }

  const trackGap = Number.parseFloat(window.getComputedStyle(track).gap || "0") || 0;
  let offset = 0;
  let paused = false;
  let lastTimestamp = 0;
  let animationFrameId = 0;

  const resetDistance = () => primaryGroup.getBoundingClientRect().width + trackGap;

  const step = (timestamp) => {
    if (!lastTimestamp) {
      lastTimestamp = timestamp;
    }

    const deltaSeconds = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    if (!paused) {
      offset -= STAFF_SCROLL_SPEED_PX_PER_SECOND * deltaSeconds;
      const distance = resetDistance();
      if (distance > 0 && Math.abs(offset) >= distance) {
        offset += distance;
      }
      track.style.transform = `translate3d(${offset}px, 0, 0)`;
    }

    animationFrameId = window.requestAnimationFrame(step);
  };

  const canHover = window.matchMedia("(hover:hover) and (pointer:fine)").matches;
  const onMouseEnter = () => {
    paused = true;
  };
  const onMouseLeave = () => {
    paused = false;
  };

  if (canHover) {
    shell.addEventListener("mouseenter", onMouseEnter);
    shell.addEventListener("mouseleave", onMouseLeave);
  }

  animationFrameId = window.requestAnimationFrame(step);

  stopStaffCarouselMotion = () => {
    window.cancelAnimationFrame(animationFrameId);
    if (canHover) {
      shell.removeEventListener("mouseenter", onMouseEnter);
      shell.removeEventListener("mouseleave", onMouseLeave);
    }
    track.style.transform = "translate3d(0, 0, 0)";
  };
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
  initStaffCarouselMotion(shell, track);
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

function createGuildBannerVisual(banner) {
  return banner && typeof banner === "object"
    ? window.EnthusiaGuildBannerRenderer?.create(banner, "Guild banner") || null
    : null;
}

function createRankElement(rank) {
  const rankEl = document.createElement("span");
  rankEl.className = "rank";
  rankEl.textContent = String(rank);
  return rankEl;
}

function createGuildFallbackHead(uuid) {
  const visual = document.createElement("img");
  visual.src = `https://minotar.net/helm/${encodeURIComponent(uuid)}/64`;
  visual.alt = "";
  visual.width = 40;
  visual.height = 40;
  visual.loading = "lazy";
  visual.decoding = "async";
  visual.className = "guild-fallback-head";
  return visual;
}

function createGuildMark(entry) {
  const visual = document.createElement("span");
  visual.className = "guild-mark";
  visual.textContent = normalizeText(entry?.iconText || entry?.tag || entry?.name || "G").slice(0, 3).toUpperCase();
  return visual;
}

function createGuildLeaderboardVisual(entry) {
  const bannerVisual = createGuildBannerVisual(entry?.banner);
  if (bannerVisual) {
    return bannerVisual;
  }

  const topMemberUuid = Array.isArray(entry?.topMemberUuids) ? normalizeText(entry.topMemberUuids[0]) : "";
  return topMemberUuid ? createGuildFallbackHead(topMemberUuid) : createGuildMark(entry);
}

function createPlayerLeaderboardVisual(entry) {
  const visual = document.createElement("img");
  const username = normalizeText(entry?.username || entry?.displayName || entry?.name || "Steve");
  visual.src = `https://minotar.net/helm/${encodeURIComponent(username)}/64`;
  visual.alt = "";
  visual.width = 40;
  visual.height = 40;
  visual.loading = "lazy";
  visual.decoding = "async";
  return visual;
}

function createLeaderboardIdentity(entry, rank) {
  const identity = document.createElement("span");
  identity.className = "leader-name";

  const name = document.createElement("strong");
  name.textContent = getLeaderboardDisplayName(entry, rank);
  identity.append(name);

  const detail = getLeaderboardDetail(entry);
  if (detail) {
    const detailEl = document.createElement("small");
    detailEl.textContent = detail;
    identity.append(detailEl);
  }

  return identity;
}

function getLeaderboardDisplayName(entry, rank) {
  return normalizeText(entry?.displayName || entry?.name || entry?.username || entry?.tag || `Rank ${rank}`);
}

function getLeaderboardDetail(entry) {
  return normalizeText(entry?.subtext || entry?.subtitle || entry?.tag || "");
}

function createLeaderboardEntry(board, entry, rank) {
  const item = document.createElement("li");
  const visual = board.mode === "guild" ? createGuildLeaderboardVisual(entry) : createPlayerLeaderboardVisual(entry);

  const value = document.createElement("span");
  value.textContent = normalizeText(entry?.value || entry?.stat || entry?.score || "--");

  item.append(createRankElement(rank), visual, createLeaderboardIdentity(entry, rank), value);
  return item;
}

function createLeaderboardBoardCard(board, active = true) {
  const article = document.createElement("article");
  article.className = "card board-card";
  article.id = `board-${board.id}`;
  if (!active) {
    article.classList.add("board-card-muted");
  }

  const head = document.createElement("div");
  head.className = "board-head";

  const headBody = document.createElement("div");
  const kicker = document.createElement("span");
  kicker.className = "card-kicker";
  kicker.textContent = board.label;

  const title = document.createElement("h3");
  title.textContent = board.title;

  const summary = document.createElement("p");
  summary.textContent = board.summary;

  headBody.append(kicker, title, summary);

  const status = document.createElement("strong");
  status.textContent = active ? "Live" : "Soon";

  head.append(headBody, status);

  const entries = document.createElement("ol");
  entries.className = "leader-list";
  entries.setAttribute("data-board-entries", board.id);

  const emptyState = document.createElement("p");
  emptyState.className = "board-empty";
  emptyState.textContent = active
    ? "Leaderboard data is unavailable right now."
    : board.summary;

  article.append(head, entries, emptyState);
  return { article, entries, emptyState };
}

function getLeaderboardCollection(payload) {
  return Array.isArray(payload)
    ? payload
    : payload?.players || payload?.guilds || payload?.entries || payload?.data || [];
}

function formatGuildValue(level, totalExperience, score) {
  if (level !== null) {
    return `Lv ${formatNumber(level)}`;
  }

  if (totalExperience !== null) {
    return `${formatNumber(totalExperience)} XP`;
  }

  return score !== null ? formatNumber(score) : "";
}

function normalizeGuildLeaderboardEntry(entry, index) {
  const level = pickNumber(entry.level, entry.currentLevel, entry.current_level);
  const totalExperience = pickNumber(entry.totalExperience, entry.total_xp, entry.totalExperiencePoints, entry.total_experience);
  const memberCount = pickNumber(entry.memberCount, entry.members, entry.member_count, entry.activeMembers, entry.active_members);
  const score = pickNumber(entry.value, entry.score);
  const name = pickText(entry.name, entry.guildName, entry.guild_name, entry.displayName, entry.display_name, entry.tagPlain, entry.tag, entry.entityName, entry.entity_name, entry.entityId, entry.entity_id);
  const tag = pickText(entry.tagPlain, entry.tag, entry.guildTag, entry.guild_tag);

  return {
    name,
    displayName: name,
    tag,
    subtext: [
      memberCount !== null ? `${formatNumber(memberCount)} members` : "",
      totalExperience !== null ? `${formatNumber(totalExperience)} XP` : ""
    ].filter(Boolean).join(" | "),
    value: formatGuildValue(level, totalExperience, score),
    banner: entry.banner,
    topMemberUuids: pickArray(entry.topMemberUuids, entry.top_member_uuids, entry.memberUuids, entry.member_uuids),
    rank: pickNumber(entry.rank) || index + 1
  };
}

function firstTruthyText() {
  const values = Array.prototype.slice.call(arguments);
  for (const value of values) {
    if (value) {
      return normalizeText(value);
    }
  }

  return "";
}

function getPlayerLeaderboardValue(entry) {
  return firstTruthyText(
    entry.formattedValue,
    entry.formatted,
    entry.stat,
    entry.score,
    entry.amount,
    entry.hours,
    entry.balance,
    entry.experience,
    entry.level
  );
}

function normalizePlayerLeaderboardEntry(entry, index) {
  return {
    name: firstTruthyText(entry.username, entry.displayName, entry.name, entry.guild_name),
    displayName: firstTruthyText(entry.displayName) || firstTruthyText(entry.username) || firstTruthyText(entry.name, entry.guild_name),
    username: firstTruthyText(entry.username, entry.player, entry.uuid),
    tag: firstTruthyText(entry.tag, entry.guildTag, entry.guild_tag),
    subtext: firstTruthyText(entry.subtext, entry.subtitle, entry.description),
    value: getPlayerLeaderboardValue(entry),
    rank: Number.isFinite(entry.rank) ? entry.rank : index + 1
  };
}

function normalizeLeaderboardEntry(entry, index, board) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  return board.mode === "guild"
    ? normalizeGuildLeaderboardEntry(entry, index)
    : normalizePlayerLeaderboardEntry(entry, index);
}

function normalizeLeaderboardEntries(payload, board) {
  const collection = getLeaderboardCollection(payload);

  if (!Array.isArray(collection)) {
    return [];
  }

  return collection
    .map((entry, index) => normalizeLeaderboardEntry(entry, index, board))
    .filter(Boolean)
    .filter((entry) => entry.displayName && entry.value)
    .slice(0, Number.isFinite(board.limit) ? board.limit : collection.length);
}

async function fetchLeaderboardEntries(board) {
  const endpoint = getLeaderboardEndpoint(board);
  if (!endpoint) {
    return [];
  }

  try {
    const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    return normalizeLeaderboardEntries(payload, board);
  } catch {
    return [];
  }
}

function getLeaderboardEndpoint(board) {
  const configuredEndpoint = normalizeText(board?.endpoint);
  const source = normalizeText(board?.source);
  const endpoint = configuredEndpoint || (source ? `/api/leaderboards/${source}` : "");

  if (!endpoint.startsWith("/api/leaderboards/")) {
    return "";
  }

  if (endpoint.startsWith("//") || endpoint.indexOf("://") !== -1) {
    return "";
  }

  return endpoint;
}

async function populateLeaderboardBoard(board, card, active) {
  if (!active) {
    return;
  }

  const entries = await fetchLeaderboardEntries(board);
  if (!entries.length) {
    return;
  }

  card.entries.replaceChildren();
  entries.forEach((entry, index) => {
    card.entries.append(createLeaderboardEntry(board, entry, entry.rank || index + 1));
  });
  card.emptyState.hidden = true;
}

function renderLeaderboardPage(cfg) {
  const config = cfg?.leaderboards;
  const activeRoot = document.getElementById("activeLeaderboardBoards");
  const upcomingRoot = document.getElementById("upcomingLeaderboardBoards");
  const upcomingSection = document.getElementById("leaderboardUpcomingSection");
  const summaryLive = document.getElementById("leaderboardLiveCount");
  const summarySpots = document.getElementById("leaderboardSpotCount");
  const summaryUpcoming = document.getElementById("leaderboardUpcomingCount");

  if (!config || !activeRoot || !upcomingRoot) {
    return;
  }

  const activeBoards = Array.isArray(config.active) ? config.active : [];
  const upcomingBoards = Array.isArray(config.upcoming) ? config.upcoming : [];

  activeRoot.replaceChildren();
  upcomingRoot.replaceChildren();

  renderActiveLeaderboardBoards(activeBoards, activeRoot);
  renderUpcomingLeaderboardBoards(upcomingBoards, upcomingRoot);

  if (upcomingSection) {
    upcomingSection.hidden = upcomingBoards.length === 0;
  }

  updateLeaderboardSummary(summaryLive, summarySpots, summaryUpcoming, activeBoards.length, upcomingBoards.length);
}

function renderActiveLeaderboardBoards(activeBoards, activeRoot) {
  activeBoards.forEach((board) => {
    const card = createLeaderboardBoardCard(board, true);
    activeRoot.append(card.article);
    void populateLeaderboardBoard(board, card, true);
  });
}

function renderUpcomingLeaderboardBoards(upcomingBoards, upcomingRoot) {
  upcomingBoards.forEach((board) => {
    const card = createLeaderboardBoardCard(board, false);
    upcomingRoot.append(card.article);
  });
}

function updateLeaderboardSummary(summaryLive, summarySpots, summaryUpcoming, activeCount, upcomingCount) {
  if (summaryLive) {
    summaryLive.textContent = String(activeCount);
  }

  if (summarySpots) {
    summarySpots.textContent = "18";
  }

  if (summaryUpcoming) {
    summaryUpcoming.textContent = String(upcomingCount);
  }
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
    thumb.src = normalizeText(slide.thumb) || slide.src;
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

function initInteractiveGlow() {
  const targets = document.querySelectorAll(
    ".card, .status-card, .timeline-item, .rules-prose section, .live-layer-card, .showcase-panel"
  );

  targets.forEach((target) => {
    target.addEventListener("pointermove", (event) => {
      const rect = target.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      target.style.setProperty("--mx", `${x.toFixed(1)}%`);
      target.style.setProperty("--my", `${y.toFixed(1)}%`);
    });
  });
}

function initScrollReveal() {
  if (document.querySelector(".staff-page-grid") || document.getElementById("activeLeaderboardBoards")) {
    return;
  }

  const revealTargets = document.querySelectorAll(
    ".hero-copy, .hero-panel, .live-layer-card, .feature-card, .timeline-item, .link-card, .showcase-panel, .content-panel, .rules-prose section, .board-card, .staff-full-card, .vote-card, .slideshow-shell"
  );

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    revealTargets.forEach((target) => target.classList.add("is-visible"));
    return;
  }

  revealTargets.forEach((target, index) => {
    target.classList.add("reveal");
    target.style.animationDelay = `${Math.min(index % 8, 7) * 45}ms`;
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });

  revealTargets.forEach((target) => observer.observe(target));
}

function initWorldEffects() {
  if (
    !document.body.classList.contains("home-page") ||
    document.body.classList.contains("static-gallery-background") ||
    document.querySelector(".world-effects")
  ) return;

  const SCENE_WIDTH = 1672;
  const SCENE_HEIGHT = 941;
  const effects = document.createElement("div");
  effects.className = "world-effects cinematic-world";
  effects.setAttribute("aria-hidden", "true");
  const scene = document.createElement("div");
  scene.className = "cinematic-scene";
  scene.style.width = `${SCENE_WIDTH}px`;
  scene.style.height = `${SCENE_HEIGHT}px`;
  const sceneDefinitions = [
    ["night", "cinematic-night-terrain", "assets/minecraft-night-valley-v3.png"],
    ["sunrise", "cinematic-sunrise-terrain", "assets/minecraft-sunrise-left-v1.png"],
    ["day", "cinematic-terrain", "assets/minecraft-day-valley-v1.png"],
    ["sunset", "cinematic-sunset-terrain", "assets/minecraft-sunset-right-v1.png"]
  ];
  const scenes = Object.fromEntries(sceneDefinitions.map(([name, className, source]) => {
    const image = document.createElement("img");
    image.className = className;
    image.src = source;
    image.alt = "";
    image.decoding = "async";
    scene.append(image);
    return [name, image];
  }));
  const foregrounds = Object.fromEntries(sceneDefinitions.map(([name]) => {
    const image = document.createElement("img");
    image.className = `cinematic-foreground cinematic-foreground-${name}`;
    image.src = `assets/minecraft-terrain-foreground-${name}-v1.png?v=8`;
    image.alt = "";
    image.decoding = "async";
    return [name, image];
  }));
  const createOrb = (name) => {
    const orb = document.createElement("div");
    orb.className = `cinematic-orb cinematic-${name}`;
    const disc = document.createElement("div");
    disc.className = "cinematic-orb-disc";
    orb.append(disc);
    return orb;
  };
  const sun = createOrb("sun");
  const moon = createOrb("moon");
  const celestial = document.createElement("div");
  celestial.className = "cinematic-celestial";
  celestial.append(sun, moon);
  const vignette = document.createElement("div");
  vignette.className = "cinematic-vignette";
  scene.append(celestial, ...Object.values(foregrounds), vignette);
  effects.append(scene);

  document.body.prepend(effects);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smooth = (value) => value * value * (3 - 2 * value);
  const mixColor = (from, to, amount) => `rgb(${from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount)).join(",")})`;
  const ambientPalettes = {
    day: [[66, 157, 214], [102, 181, 219], [24, 55, 47]],
    sunset: [[43, 31, 72], [171, 77, 76], [38, 31, 28]],
    night: [[3, 9, 27], [8, 27, 55], [8, 22, 22]],
    sunrise: [[68, 45, 78], [186, 100, 87], [42, 34, 29]]
  };
  const setAmbient = (from, to, amount) => {
    effects.style.setProperty("--scene-edge-top", mixColor(from[0], to[0], amount));
    effects.style.setProperty("--scene-edge-mid", mixColor(from[1], to[1], amount));
    effects.style.setProperty("--scene-edge-bottom", mixColor(from[2], to[2], amount));
  };
  const setEdgeScene = (from, to = from, amount = 0) => {
    effects.style.setProperty("--scene-edge-from", `url("${from}")`);
    effects.style.setProperty("--scene-edge-to", `url("${to}")`);
    effects.style.setProperty("--scene-edge-mix", amount.toFixed(3));
  };
  const cubicPoint = (start, controlA, controlB, end, progress) => {
    const inverse = 1 - progress;
    return {
      x: inverse ** 3 * start.x + 3 * inverse ** 2 * progress * controlA.x + 3 * inverse * progress ** 2 * controlB.x + progress ** 3 * end.x,
      y: inverse ** 3 * start.y + 3 * inverse ** 2 * progress * controlA.y + 3 * inverse * progress ** 2 * controlB.y + progress ** 3 * end.y
    };
  };
  const placeOrb = (orb, point, visible) => {
    orb.style.transform = `translate3d(${point.x.toFixed(2)}px,${point.y.toFixed(2)}px,0)`;
    orb.hidden = !visible;
  };
  const setTransition = (layers, fromName, toName, amount, baseZ = 0) => {
    Object.values(layers).forEach((image) => {
      image.style.opacity = "0";
      image.style.zIndex = `${baseZ}`;
    });
    const from = layers[fromName];
    const to = layers[toName];
    from.style.opacity = "1";
    from.style.zIndex = `${baseZ + 1}`;
    if (from === to) return;
    to.style.opacity = amount.toFixed(3);
    to.style.zIndex = `${baseZ + 2}`;
  };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const debugEnabled = new URLSearchParams(window.location.search).get("sceneDebug") === "1";
  const debugLayer = new URLSearchParams(window.location.search).get("debugLayer") || "all";
  const debugGlowDisabled = new URLSearchParams(window.location.search).get("sceneGlow") === "0";
  let sceneScale = 1;
  let sceneOrigin = { x: 0, y: 0 };
  let mobileCamera = false;
  let logoStart = { x: SCENE_WIDTH * 0.5, y: SCENE_HEIGHT * 0.2 };
  let idleTimer = 0;
  let currentProgress = 0;

  let debugHud = null;
  let debugSunPath = null;
  if (debugEnabled) {
    effects.classList.add("is-scene-debug");
    effects.classList.add(`scene-debug-layer-${debugLayer}`);
    const debugTerrain = document.createElement("div");
    debugTerrain.className = "scene-debug-terrain";
    const debugSky = document.createElement("div");
    debugSky.className = "scene-debug-sky";
    const debugSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    debugSvg.classList.add("scene-debug-svg");
    debugSvg.setAttribute("viewBox", `0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`);
    debugSvg.innerHTML = `<path class="debug-sun-path"/><path class="debug-moon-path" d="M 134 620 C 330 65 1110 65 1538 650"/><circle class="debug-sun-center" r="8"/><circle class="debug-moon-center" r="8"/>`;
    debugSunPath = debugSvg.querySelector(".debug-sun-path");
    scene.append(debugTerrain, debugSky, debugSvg);
    debugTerrain.hidden = debugLayer === "sky";
    debugSky.hidden = debugLayer !== "sky";
    debugSvg.hidden = ["sun-disk", "moon-disk", "foreground"].includes(debugLayer);
    debugHud = document.createElement("pre");
    debugHud.className = "scene-debug-hud";
    effects.append(debugHud);
  }

  const measureScene = () => {
    mobileCamera = window.innerWidth <= 620 && window.innerHeight > window.innerWidth;
    effects.classList.toggle("is-mobile-camera", mobileCamera);
    sceneScale = mobileCamera
      ? clamp((window.innerWidth / SCENE_WIDTH) * 2.05, 0.43, 0.56)
      : window.innerHeight / SCENE_HEIGHT;
    sceneOrigin = mobileCamera
      ? { x: (window.innerWidth - SCENE_WIDTH * sceneScale) / 2, y: window.innerHeight - SCENE_HEIGHT * sceneScale }
      : { x: (window.innerWidth - SCENE_WIDTH * sceneScale) / 2, y: (window.innerHeight - SCENE_HEIGHT * sceneScale) / 2 };
    scene.style.left = `${sceneOrigin.x}px`;
    scene.style.top = `${sceneOrigin.y}px`;
    scene.style.bottom = "auto";
    scene.style.transformOrigin = "top left";
    scene.style.transform = `scale(${sceneScale})`;
    const logo = document.querySelector(".cinematic-logo");
    if (logo) {
      const bounds = logo.getBoundingClientRect();
      logoStart = {
        x: (bounds.left + bounds.width / 2 - sceneOrigin.x) / sceneScale,
        y: (bounds.top + bounds.height / 2 - sceneOrigin.y) / sceneScale
      };
    }
    render();
  };

  const render = () => {
    const maximum = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const testProgress = Number.parseFloat(document.body.dataset.celestialProgress || "");
    currentProgress = Number.isFinite(testProgress) ? clamp(testProgress, 0, 1) : clamp(window.scrollY / maximum, 0, 1);
    let nightLevel = 0;
    let warmth = 0;
    let phaseBlend = { from: "day", to: "day", amount: 0 };
    if (currentProgress < 0.28) {
      const amount = smooth(clamp((currentProgress - 0.06) / 0.22, 0, 1));
      setTransition(scenes, "day", "sunset", amount);
      setTransition(foregrounds, "day", "sunset", amount, 5);
      phaseBlend = { from: "day", to: "sunset", amount };
      setAmbient(ambientPalettes.day, ambientPalettes.sunset, amount);
      setEdgeScene("minecraft-day-valley-v1.png", "minecraft-sunset-right-v1.png", amount);
      warmth = amount;
    } else if (currentProgress < 0.4) {
      const amount = smooth((currentProgress - 0.28) / 0.12);
      setTransition(scenes, "sunset", "night", amount);
      setTransition(foregrounds, "sunset", "night", amount, 5);
      phaseBlend = { from: "sunset", to: "night", amount };
      setAmbient(ambientPalettes.sunset, ambientPalettes.night, amount);
      setEdgeScene("minecraft-sunset-right-v1.png", "minecraft-night-valley-v3.png", amount);
      warmth = 1 - amount;
      nightLevel = amount;
    } else if (currentProgress < 0.66) {
      setTransition(scenes, "night", "night", 0);
      setTransition(foregrounds, "night", "night", 0, 5);
      phaseBlend = { from: "night", to: "night", amount: 0 };
      setAmbient(ambientPalettes.night, ambientPalettes.night, 0);
      setEdgeScene("minecraft-night-valley-v3.png");
      nightLevel = 1;
    } else if (currentProgress < 0.82) {
      const amount = smooth((currentProgress - 0.66) / 0.16);
      setTransition(scenes, "night", "sunrise", amount);
      setTransition(foregrounds, "night", "sunrise", amount, 5);
      phaseBlend = { from: "night", to: "sunrise", amount };
      setAmbient(ambientPalettes.night, ambientPalettes.sunrise, amount);
      setEdgeScene("minecraft-night-valley-v3.png", "minecraft-sunrise-left-v1.png", amount);
      warmth = amount;
      nightLevel = 1 - amount;
    } else {
      const amount = smooth((currentProgress - 0.82) / 0.18);
      setTransition(scenes, "sunrise", "day", amount);
      setTransition(foregrounds, "sunrise", "day", amount, 5);
      phaseBlend = { from: "sunrise", to: "day", amount };
      setAmbient(ambientPalettes.sunrise, ambientPalettes.day, amount);
      setEdgeScene("minecraft-sunrise-left-v1.png", "minecraft-day-valley-v1.png", amount);
      warmth = 1 - amount;
    }

    const screenToScene = (x, y) => ({ x: (x - sceneOrigin.x) / sceneScale, y: (y - sceneOrigin.y) / sceneScale });
    let sunEnd = logoStart;
    let sunControlA = logoStart;
    let sunControlB = logoStart;
    let sunPoint = logoStart;
    if (mobileCamera) {
      sun.hidden = true;
      sun.style.transform = "";
    } else {
      sunEnd = { x: SCENE_WIDTH * 0.88, y: SCENE_HEIGHT * 0.69 };
      sunControlA = { x: Math.max(logoStart.x + 210, SCENE_WIDTH * 0.52), y: Math.max(68, logoStart.y - 190) };
      sunControlB = { x: SCENE_WIDTH * 0.73, y: SCENE_HEIGHT * 0.08 };
      const sunPhase = smooth(clamp(currentProgress / 0.34, 0, 1));
      sunPoint = cubicPoint(logoStart, sunControlA, sunControlB, sunEnd, sunPhase);
      placeOrb(sun, sunPoint, currentProgress <= 0.38);
    }

    const moonStart = mobileCamera ? { x: 470, y: 610 } : { x: SCENE_WIDTH * 0.08, y: SCENE_HEIGHT * 0.66 };
    const moonEnd = mobileCamera ? { x: 1200, y: 585 } : { x: SCENE_WIDTH * 0.92, y: SCENE_HEIGHT * 0.69 };
    const moonPhase = smooth(clamp((currentProgress - 0.29) / 0.47, 0, 1));
    const moonControlA = mobileCamera ? screenToScene(window.innerWidth * 0.24, window.innerHeight * 0.16) : { x: SCENE_WIDTH * 0.24, y: SCENE_HEIGHT * 0.06 };
    const moonControlB = mobileCamera ? screenToScene(window.innerWidth * 0.7, window.innerHeight * 0.12) : { x: SCENE_WIDTH * 0.68, y: SCENE_HEIGHT * 0.06 };
    const moonPoint = cubicPoint(moonStart, moonControlA, moonControlB, moonEnd, moonPhase);
    placeOrb(moon, moonPoint, currentProgress >= 0.27 && currentProgress <= 0.78);

    if (debugGlowDisabled) {
      sun.querySelector(".cinematic-orb-disc").style.boxShadow = "none";
      moon.querySelector(".cinematic-orb-disc").style.boxShadow = "none";
    }

    if (debugEnabled && (debugLayer === "sun-disk" || debugLayer === "moon-disk")) {
      Object.values(foregrounds).forEach((image) => { image.style.opacity = "0"; });
      vignette.hidden = true;
      const selectedOrb = debugLayer === "sun-disk" ? sun : moon;
      const hiddenOrb = debugLayer === "sun-disk" ? moon : sun;
      selectedOrb.hidden = false;
      hiddenOrb.hidden = true;
      selectedOrb.querySelector(".cinematic-orb-disc").style.boxShadow = "none";
    }

    if (debugEnabled && debugLayer === "foreground") {
      Object.values(scenes).forEach((image) => { image.style.opacity = "0"; });
      celestial.hidden = true;
      vignette.hidden = true;
    }

    if (debugEnabled && Object.hasOwn(foregrounds, debugLayer)) {
      Object.entries(foregrounds).forEach(([name, image]) => {
        image.style.opacity = name === debugLayer ? "1" : "0";
      });
    }
    effects.style.setProperty("--night", nightLevel.toFixed(3));
    document.documentElement.style.setProperty("--cinematic-night", nightLevel.toFixed(3));
    document.documentElement.style.setProperty("--panel-alpha", (0.18 + nightLevel * 0.4).toFixed(3));
    if (debugEnabled) {
      debugSunPath?.setAttribute("d", `M ${logoStart.x.toFixed(1)} ${logoStart.y.toFixed(1)} C ${sunControlA.x.toFixed(1)} ${sunControlA.y.toFixed(1)} ${sunControlB.x.toFixed(1)} ${sunControlB.y.toFixed(1)} ${sunEnd.x.toFixed(1)} ${sunEnd.y.toFixed(1)}`);
      scene.querySelector(".debug-sun-center")?.setAttribute("transform", `translate(${sunPoint.x} ${sunPoint.y})`);
      scene.querySelector(".debug-moon-center")?.setAttribute("transform", `translate(${moonPoint.x} ${moonPoint.y})`);
      const cropX = -sceneOrigin.x;
      const cropY = -sceneOrigin.y;
      debugHud.textContent = `progress ${currentProgress.toFixed(4)}\nphase ${phaseBlend.from}->${phaseBlend.to} ${phaseBlend.amount.toFixed(3)}\ncamera ${mobileCamera ? "mobile" : "desktop"}\nscene ${SCENE_WIDTH}x${SCENE_HEIGHT}\nscale ${sceneScale.toFixed(5)}\norigin ${sceneOrigin.x.toFixed(1)}, ${sceneOrigin.y.toFixed(1)}\ncrop ${cropX.toFixed(1)}, ${cropY.toFixed(1)}\nlogo ${logoStart.x.toFixed(1)}, ${logoStart.y.toFixed(1)}\nsun ${sunPoint.x.toFixed(1)}, ${sunPoint.y.toFixed(1)} bbox ${(sunPoint.x - 66).toFixed(1)},${(sunPoint.y - 66).toFixed(1)} ${(sunPoint.x + 66).toFixed(1)},${(sunPoint.y + 66).toFixed(1)}\nmoon ${moonPoint.x.toFixed(1)}, ${moonPoint.y.toFixed(1)} bbox ${(moonPoint.x - 66).toFixed(1)},${(moonPoint.y - 66).toFixed(1)} ${(moonPoint.x + 66).toFixed(1)},${(moonPoint.y + 66).toFixed(1)}`;
    }
  };

  const stopIdle = () => {
    effects.classList.remove("is-sun-idle");
    window.clearTimeout(idleTimer);
    if (!reducedMotion && window.scrollY < 2) {
      idleTimer = window.setTimeout(() => effects.classList.add("is-sun-idle"), 220);
    }
  };
  window.addEventListener("scroll", () => {
    stopIdle();
    render();
  }, { passive: true });
  window.addEventListener("resize", measureScene, { passive: true });
  window.addEventListener("load", measureScene, { once: true });
  document.querySelector(".cinematic-logo")?.addEventListener("load", measureScene, { once: true });
  Promise.all([...Object.values(scenes), ...Object.values(foregrounds)].map((image) => image.decode?.().catch(() => undefined))).then(measureScene);
  measureScene();
  stopIdle();
}

function initCinematicHeader() {
  if (!document.body.classList.contains("home-page")) return;

  const deck = document.getElementById("server-deck");
  const updateHeader = () => {
    const deckBottom = deck ? deck.getBoundingClientRect().bottom : 0;
    document.body.classList.toggle("is-past-deck", deckBottom <= 96);
  };

  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });
  window.addEventListener("resize", updateHeader);
}

function initReturnToTop() {
  const desktopQuery = window.matchMedia("(min-width: 781px)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const button = document.createElement("button");
  button.className = "return-to-top";
  button.type = "button";
  button.setAttribute("aria-label", "Return to navigation");
  button.innerHTML = '<span aria-hidden="true">↑</span>';
  document.body.append(button);

  const homeTarget = document.body.classList.contains("home-page")
    ? document.querySelector(".home-page-links")
    : null;
  const destinationTop = () => homeTarget
    ? window.scrollY + homeTarget.getBoundingClientRect().top
    : 0;
  const update = () => {
    const threshold = destinationTop() + (homeTarget ? 180 : Math.max(420, window.innerHeight * 0.65));
    const visible = desktopQuery.matches && window.scrollY > threshold;
    button.classList.toggle("is-visible", visible);
    button.tabIndex = visible ? 0 : -1;
    button.setAttribute("aria-hidden", visible ? "false" : "true");
  };

  button.addEventListener("click", () => {
    if (homeTarget) {
      homeTarget.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    }
  });
  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });
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
    wikiUrl: normalizeText(cfg?.wikiUrl)
  };

  setExternalLinkTargets(normalizedConfig);
  setContactEmail(normalizedConfig);
  initWorldEffects();
  initCinematicHeader();
  initDesktopDropdownGrace();
  initDesktopExternalNavigation();
  initMobileNavigation();
  initReturnToTop();
  initCopyIpButton(normalizedConfig.serverIp);
  initShareButton(normalizedConfig);
  initStatusRefresh(normalizedConfig.serverIp);
  renderScreenshotSlideshow(cfg?.home?.screenshots);
  renderStaffCarousel(cfg?.home?.staff);
  renderFaqItems(cfg?.home?.faq);
  renderWikiCallout(normalizedConfig);
  renderLeaderboardPage(cfg);
  initInteractiveGlow();
  initScrollReveal();
  void updateServerStatus(normalizedConfig.serverIp);

  if (document.getElementById("serverStatus") && isConfiguredValue(normalizedConfig.serverIp)) {
    window.setInterval(() => {
      void updateServerStatus(normalizedConfig.serverIp);
    }, STATUS_REFRESH_INTERVAL_MS);
  }

  void renderDiscordWidget(normalizedConfig);
}

document.addEventListener("DOMContentLoaded", () => {
  void initSite(window.ENTHUSIA || {});
});
