const STATUS_REFRESH_INTERVAL_MS = 60000;
const SCREENSHOT_AUTOPLAY_MS = 3000;
const SCREENSHOT_MANUAL_PAUSE_MS = 7000;
const STAFF_SCROLL_SPEED_PX_PER_SECOND = 28;

let stopStaffCarouselMotion = null;
let guildBannerClipSequence = 0;

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

  const toggle = document.createElement("button");
  toggle.className = "nav-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Open navigation");
  toggle.innerHTML = "<span></span><span></span><span></span>";
  brand.after(toggle);
  header.classList.add("nav-enhanced");

  const setOpen = (open) => {
    header.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  };

  nav.querySelectorAll(".nav-dropdown").forEach((dropdown) => {
    const trigger = dropdown.querySelector(".nav-drop-trigger");
    if (!trigger) return;
    trigger.setAttribute("aria-expanded", "false");
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const willOpen = !dropdown.classList.contains("is-open");
      nav.querySelectorAll(".nav-dropdown.is-open").forEach((openDropdown) => {
        openDropdown.classList.remove("is-open");
        openDropdown.querySelector(".nav-drop-trigger")?.setAttribute("aria-expanded", "false");
      });
      dropdown.classList.toggle("is-open", willOpen);
      trigger.setAttribute("aria-expanded", String(willOpen));
    });
  });

  toggle.addEventListener("click", () => setOpen(!header.classList.contains("nav-open")));
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
  document.addEventListener("click", () => {
    nav.querySelectorAll(".nav-dropdown.is-open").forEach((dropdown) => {
      dropdown.classList.remove("is-open");
      dropdown.querySelector(".nav-drop-trigger")?.setAttribute("aria-expanded", "false");
    });
  });
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

const BANNER_COLORS = {
  white: "#f9fffe",
  orange: "#f9801d",
  magenta: "#c74ebd",
  light_blue: "#3ab3da",
  yellow: "#fed83d",
  lime: "#80c71f",
  pink: "#f38baa",
  gray: "#474f52",
  light_gray: "#9d9d97",
  cyan: "#169c9c",
  purple: "#8932b8",
  blue: "#3c44aa",
  brown: "#835432",
  green: "#5e7c16",
  red: "#b02e26",
  black: "#1d1d21"
};

function createSvgNode(tagName, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tagName);
  Object.entries(attributes).forEach(([name, value]) => {
    node.setAttribute(name, String(value));
  });
  return node;
}

function normalizeBannerColor(color) {
  const normalized = normalizeText(color).toLowerCase().replace(/[\s-]+/g, "_");
  return BANNER_COLORS[normalized] || "#d1b37b";
}

function getPatternCode(pattern) {
  return normalizeText(pattern?.pattern || pattern?.code || pattern?.type || pattern?.key).toLowerCase();
}

function getPatternColor(pattern) {
  return normalizeBannerColor(pattern?.color || pattern?.dyeColor || pattern?.shade);
}

const STRIPE_BOTTOM_SHAPES = [["rect", { x: 0, y: 26, width: 20, height: 8 }]];
const STRIPE_TOP_SHAPES = [["rect", { x: 0, y: 0, width: 20, height: 8 }]];
const STRIPE_LEFT_SHAPES = [["rect", { x: 0, y: 0, width: 6, height: 40 }]];
const STRIPE_RIGHT_SHAPES = [["rect", { x: 14, y: 0, width: 6, height: 40 }]];
const STRIPE_CENTER_SHAPES = [["rect", { x: 7, y: 0, width: 6, height: 40 }]];
const STRIPE_MIDDLE_SHAPES = [["rect", { x: 0, y: 16, width: 20, height: 8 }]];
const BORDER_SHAPES = [
  ["rect", { x: 0, y: 0, width: 20, height: 4 }],
  ["rect", { x: 0, y: 0, width: 4, height: 40 }],
  ["rect", { x: 16, y: 0, width: 4, height: 40 }],
  ["rect", { x: 0, y: 30, width: 20, height: 10 }]
];
const CROSS_SHAPES = [
  ["rect", { x: 7, y: 0, width: 6, height: 40 }],
  ["rect", { x: 0, y: 16, width: 20, height: 8 }]
];
const SALTIRE_SHAPES = [
  ["path", { d: "M-4 4 L4 -4 L24 28 L16 36 Z" }],
  ["path", { d: "M24 4 L16 -4 L-4 28 L4 36 Z" }]
];
const DIAGONAL_LEFT_SHAPES = [["path", { d: "M-4 30 L6 40 L24 8 L14 -2 Z" }]];
const DIAGONAL_RIGHT_SHAPES = [["path", { d: "M24 30 L14 40 L-4 8 L6 -2 Z" }]];
const CIRCLE_SHAPES = [["circle", { cx: 10, cy: 16, r: 6 }]];
const RHOMBUS_SHAPES = [["path", { d: "M10 6 L16 16 L10 26 L4 16 Z" }]];
const TRIANGLE_TOP_SHAPES = [["path", { d: "M10 0 L20 12 L0 12 Z" }]];
const TRIANGLE_BOTTOM_SHAPES = [["path", { d: "M0 26 L20 26 L10 40 Z" }]];

const BANNER_PATTERN_SHAPES = {
  bs: STRIPE_BOTTOM_SHAPES,
  stripe_bottom: STRIPE_BOTTOM_SHAPES,
  ts: STRIPE_TOP_SHAPES,
  stripe_top: STRIPE_TOP_SHAPES,
  ls: STRIPE_LEFT_SHAPES,
  stripe_left: STRIPE_LEFT_SHAPES,
  rs: STRIPE_RIGHT_SHAPES,
  stripe_right: STRIPE_RIGHT_SHAPES,
  cs: STRIPE_CENTER_SHAPES,
  stripe_center: STRIPE_CENTER_SHAPES,
  ms: STRIPE_MIDDLE_SHAPES,
  stripe_middle: STRIPE_MIDDLE_SHAPES,
  bo: BORDER_SHAPES,
  border: BORDER_SHAPES,
  cr: CROSS_SHAPES,
  cross: CROSS_SHAPES,
  sc: SALTIRE_SHAPES,
  straight_cross: SALTIRE_SHAPES,
  saltire: SALTIRE_SHAPES,
  dls: DIAGONAL_LEFT_SHAPES,
  diagonal_left: DIAGONAL_LEFT_SHAPES,
  drs: DIAGONAL_RIGHT_SHAPES,
  diagonal_right: DIAGONAL_RIGHT_SHAPES,
  mc: CIRCLE_SHAPES,
  circle: CIRCLE_SHAPES,
  mr: RHOMBUS_SHAPES,
  rhombus: RHOMBUS_SHAPES,
  tt: TRIANGLE_TOP_SHAPES,
  triangle_top: TRIANGLE_TOP_SHAPES,
  bt: TRIANGLE_BOTTOM_SHAPES,
  triangle_bottom: TRIANGLE_BOTTOM_SHAPES
};

function appendBannerPattern(group, code, color) {
  const shapes = BANNER_PATTERN_SHAPES[code];
  if (!Array.isArray(shapes)) {
    return;
  }

  shapes.forEach(([tagName, attributes]) => {
    group.append(createSvgNode(tagName, { ...attributes, fill: color }));
  });
}

function createGuildBannerVisual(banner) {
  if (!banner || typeof banner !== "object") {
    return null;
  }

  guildBannerClipSequence += 1;
  const clipId = `guild-banner-clip-${guildBannerClipSequence}`;
  const svg = createSvgNode("svg", {
    viewBox: "0 0 20 40",
    class: "guild-banner",
    role: "img",
    "aria-hidden": "true"
  });

  const defs = createSvgNode("defs");
  const clipPath = createSvgNode("clipPath", { id: clipId });
  clipPath.append(createSvgNode("path", { d: "M2 2 H18 V30 L10 38 L2 30 Z" }));
  defs.append(clipPath);
  svg.append(defs);

  const group = createSvgNode("g", { "clip-path": `url(#${clipId})` });
  group.append(createSvgNode("rect", {
    x: 0,
    y: 0,
    width: 20,
    height: 40,
    fill: normalizeBannerColor(banner.baseColor || banner.base || banner.color || banner.base_color || "black")
  }));

  const patterns = Array.isArray(banner.patterns) ? banner.patterns : [];
  patterns.forEach((pattern) => appendBannerPattern(group, getPatternCode(pattern), getPatternColor(pattern)));
  svg.append(group);
  svg.append(createSvgNode("path", {
    d: "M2 2 H18 V30 L10 38 L2 30 Z",
    fill: "none",
    stroke: "rgba(255,241,199,0.26)",
    "stroke-width": 1
  }));

  return svg;
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
  if (!document.body.classList.contains("home-page") || document.querySelector(".world-effects")) return;

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
  const foreground = document.createElement("img");
  foreground.className = "cinematic-foreground";
  foreground.src = "assets/minecraft-terrain-foreground-v1.png?v=3";
  foreground.alt = "";
  foreground.decoding = "async";
  const vignette = document.createElement("div");
  vignette.className = "cinematic-vignette";
  scene.append(celestial, foreground, vignette);
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
  const setEdgeScene = (source) => {
    effects.style.setProperty("--scene-edge-image", `url("${source}")`);
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
  const setTransition = (from, to, amount) => {
    Object.values(scenes).forEach((image) => {
      image.style.opacity = "0";
      image.style.zIndex = "0";
    });
    from.style.opacity = "1";
    from.style.zIndex = "1";
    if (from === to) return;
    to.style.opacity = amount.toFixed(3);
    to.style.zIndex = "2";
  };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const debugEnabled = new URLSearchParams(window.location.search).get("sceneDebug") === "1";
  let sceneScale = 1;
  let logoStart = { x: SCENE_WIDTH * 0.5, y: SCENE_HEIGHT * 0.2 };
  let idleTimer = 0;
  let currentProgress = 0;

  let debugHud = null;
  let debugSunPath = null;
  if (debugEnabled) {
    effects.classList.add("is-scene-debug");
    const debugTerrain = document.createElement("div");
    debugTerrain.className = "scene-debug-terrain";
    const debugSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    debugSvg.classList.add("scene-debug-svg");
    debugSvg.setAttribute("viewBox", `0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`);
    debugSvg.innerHTML = `<path class="debug-sun-path"/><path class="debug-moon-path" d="M 134 620 C 330 65 1110 65 1538 650"/><circle class="debug-sun-center" r="8"/><circle class="debug-moon-center" r="8"/>`;
    debugSunPath = debugSvg.querySelector(".debug-sun-path");
    scene.append(debugTerrain, debugSvg);
    debugHud = document.createElement("pre");
    debugHud.className = "scene-debug-hud";
    effects.append(debugHud);
  }

  const measureScene = () => {
    sceneScale = window.innerHeight / SCENE_HEIGHT;
    scene.style.transform = `translate(-50%,-50%) scale(${sceneScale})`;
    const logo = document.querySelector(".cinematic-logo");
    if (logo) {
      const bounds = logo.getBoundingClientRect();
      logoStart = {
        x: (bounds.left + bounds.width / 2 + 6 - window.innerWidth / 2) / sceneScale + SCENE_WIDTH / 2,
        y: (bounds.top + bounds.height / 2 - 28 - window.innerHeight / 2) / sceneScale + SCENE_HEIGHT / 2
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
    if (currentProgress < 0.28) {
      const amount = smooth(clamp((currentProgress - 0.06) / 0.22, 0, 1));
      setTransition(scenes.day, scenes.sunset, amount);
      setAmbient(ambientPalettes.day, ambientPalettes.sunset, amount);
      setEdgeScene(amount < 0.5 ? "minecraft-day-valley-v1.png" : "minecraft-sunset-right-v1.png");
      warmth = amount;
    } else if (currentProgress < 0.4) {
      const amount = smooth((currentProgress - 0.28) / 0.12);
      setTransition(scenes.sunset, scenes.night, amount);
      setAmbient(ambientPalettes.sunset, ambientPalettes.night, amount);
      setEdgeScene(amount < 0.5 ? "minecraft-sunset-right-v1.png" : "minecraft-night-valley-v3.png");
      warmth = 1 - amount;
      nightLevel = amount;
    } else if (currentProgress < 0.66) {
      setTransition(scenes.night, scenes.night, 0);
      setAmbient(ambientPalettes.night, ambientPalettes.night, 0);
      setEdgeScene("minecraft-night-valley-v3.png");
      nightLevel = 1;
    } else if (currentProgress < 0.82) {
      const amount = smooth((currentProgress - 0.66) / 0.16);
      setTransition(scenes.night, scenes.sunrise, amount);
      setAmbient(ambientPalettes.night, ambientPalettes.sunrise, amount);
      setEdgeScene(amount < 0.5 ? "minecraft-night-valley-v3.png" : "minecraft-sunrise-left-v1.png");
      warmth = amount;
      nightLevel = 1 - amount;
    } else {
      const amount = smooth((currentProgress - 0.82) / 0.18);
      setTransition(scenes.sunrise, scenes.day, amount);
      setAmbient(ambientPalettes.sunrise, ambientPalettes.day, amount);
      setEdgeScene(amount < 0.5 ? "minecraft-sunrise-left-v1.png" : "minecraft-day-valley-v1.png");
      warmth = 1 - amount;
    }

    const sunEnd = { x: SCENE_WIDTH * 0.88, y: SCENE_HEIGHT * 0.69 };
    const sunControlA = { x: Math.max(logoStart.x + 210, SCENE_WIDTH * 0.52), y: Math.max(68, logoStart.y - 190) };
    const sunControlB = { x: SCENE_WIDTH * 0.73, y: SCENE_HEIGHT * 0.08 };
    const sunPhase = smooth(clamp(currentProgress / 0.34, 0, 1));
    const sunPoint = cubicPoint(logoStart, sunControlA, sunControlB, sunEnd, sunPhase);
    placeOrb(sun, sunPoint, currentProgress <= 0.38);

    const moonStart = { x: SCENE_WIDTH * 0.08, y: SCENE_HEIGHT * 0.66 };
    const moonEnd = { x: SCENE_WIDTH * 0.92, y: SCENE_HEIGHT * 0.69 };
    const moonPhase = smooth(clamp((currentProgress - 0.29) / 0.47, 0, 1));
    const moonPoint = cubicPoint(moonStart, { x: SCENE_WIDTH * 0.24, y: SCENE_HEIGHT * 0.06 }, { x: SCENE_WIDTH * 0.68, y: SCENE_HEIGHT * 0.06 }, moonEnd, moonPhase);
    placeOrb(moon, moonPoint, currentProgress >= 0.27 && currentProgress <= 0.78);

    foreground.style.filter = `brightness(${(1 - nightLevel * 0.62).toFixed(3)}) saturate(${(1 - nightLevel * 0.24 + warmth * 0.22).toFixed(3)}) sepia(${(warmth * 0.2).toFixed(3)}) hue-rotate(${(-warmth * 8).toFixed(2)}deg)`;
    effects.style.setProperty("--night", nightLevel.toFixed(3));
    document.documentElement.style.setProperty("--cinematic-night", nightLevel.toFixed(3));
    document.documentElement.style.setProperty("--panel-alpha", (0.18 + nightLevel * 0.4).toFixed(3));
    if (debugEnabled) {
      debugSunPath?.setAttribute("d", `M ${logoStart.x.toFixed(1)} ${logoStart.y.toFixed(1)} C ${sunControlA.x.toFixed(1)} ${sunControlA.y.toFixed(1)} ${sunControlB.x.toFixed(1)} ${sunControlB.y.toFixed(1)} ${sunEnd.x.toFixed(1)} ${sunEnd.y.toFixed(1)}`);
      scene.querySelector(".debug-sun-center")?.setAttribute("transform", `translate(${sunPoint.x} ${sunPoint.y})`);
      scene.querySelector(".debug-moon-center")?.setAttribute("transform", `translate(${moonPoint.x} ${moonPoint.y})`);
      const cropX = (SCENE_WIDTH * sceneScale - window.innerWidth) / 2;
      const cropY = (SCENE_HEIGHT * sceneScale - window.innerHeight) / 2;
      debugHud.textContent = `progress ${currentProgress.toFixed(4)}\nscene ${SCENE_WIDTH}x${SCENE_HEIGHT}\nscale ${sceneScale.toFixed(5)}\ncrop ${cropX.toFixed(1)}, ${cropY.toFixed(1)}\nlogo ${logoStart.x.toFixed(1)}, ${logoStart.y.toFixed(1)}\nsun ${sunPoint.x.toFixed(1)}, ${sunPoint.y.toFixed(1)}\nmoon ${moonPoint.x.toFixed(1)}, ${moonPoint.y.toFixed(1)}`;
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
  Promise.all(Object.values(scenes).concat(foreground).map((image) => image.decode?.().catch(() => undefined))).then(measureScene);
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
  initMobileNavigation();
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
