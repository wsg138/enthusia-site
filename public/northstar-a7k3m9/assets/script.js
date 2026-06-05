const STATUS_REFRESH_INTERVAL_MS = 60000;
const SCREENSHOT_AUTOPLAY_MS = 1500;
const SCREENSHOT_MANUAL_PAUSE_MS = 5000;
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
  const copyButtons = [document.getElementById("copyIpBtn"), document.getElementById("copyIpMiniBtn")].filter(Boolean);
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
    applyServerStatus(await fetchServerStatus(ip), statusEl, countEl);
  } catch {
    countEl.textContent = "--";
    setStatusBadge(statusEl, "TBA", "unknown");
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

function renderDiscordFallback(cardRoot, invite) {
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
  emptyState.textContent = "No visible members are listed right now.";
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
    actions.append(createDiscordLinkButton(activeInvite, "Open Discord"));
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

const BANNER_PATTERN_SHAPES = {
  bs: [["rect", { x: 0, y: 26, width: 20, height: 8 }]],
  stripe_bottom: [["rect", { x: 0, y: 26, width: 20, height: 8 }]],
  ts: [["rect", { x: 0, y: 0, width: 20, height: 8 }]],
  stripe_top: [["rect", { x: 0, y: 0, width: 20, height: 8 }]],
  ls: [["rect", { x: 0, y: 0, width: 6, height: 40 }]],
  stripe_left: [["rect", { x: 0, y: 0, width: 6, height: 40 }]],
  rs: [["rect", { x: 14, y: 0, width: 6, height: 40 }]],
  stripe_right: [["rect", { x: 14, y: 0, width: 6, height: 40 }]],
  cs: [["rect", { x: 7, y: 0, width: 6, height: 40 }]],
  stripe_center: [["rect", { x: 7, y: 0, width: 6, height: 40 }]],
  ms: [["rect", { x: 0, y: 16, width: 20, height: 8 }]],
  stripe_middle: [["rect", { x: 0, y: 16, width: 20, height: 8 }]],
  bo: [
    ["rect", { x: 0, y: 0, width: 20, height: 4 }],
    ["rect", { x: 0, y: 0, width: 4, height: 40 }],
    ["rect", { x: 16, y: 0, width: 4, height: 40 }],
    ["rect", { x: 0, y: 30, width: 20, height: 10 }]
  ],
  border: [
    ["rect", { x: 0, y: 0, width: 20, height: 4 }],
    ["rect", { x: 0, y: 0, width: 4, height: 40 }],
    ["rect", { x: 16, y: 0, width: 4, height: 40 }],
    ["rect", { x: 0, y: 30, width: 20, height: 10 }]
  ],
  cr: [
    ["rect", { x: 7, y: 0, width: 6, height: 40 }],
    ["rect", { x: 0, y: 16, width: 20, height: 8 }]
  ],
  cross: [
    ["rect", { x: 7, y: 0, width: 6, height: 40 }],
    ["rect", { x: 0, y: 16, width: 20, height: 8 }]
  ],
  sc: [
    ["path", { d: "M-4 4 L4 -4 L24 28 L16 36 Z" }],
    ["path", { d: "M24 4 L16 -4 L-4 28 L4 36 Z" }]
  ],
  straight_cross: [
    ["path", { d: "M-4 4 L4 -4 L24 28 L16 36 Z" }],
    ["path", { d: "M24 4 L16 -4 L-4 28 L4 36 Z" }]
  ],
  saltire: [
    ["path", { d: "M-4 4 L4 -4 L24 28 L16 36 Z" }],
    ["path", { d: "M24 4 L16 -4 L-4 28 L4 36 Z" }]
  ],
  dls: [["path", { d: "M-4 30 L6 40 L24 8 L14 -2 Z" }]],
  diagonal_left: [["path", { d: "M-4 30 L6 40 L24 8 L14 -2 Z" }]],
  drs: [["path", { d: "M24 30 L14 40 L-4 8 L6 -2 Z" }]],
  diagonal_right: [["path", { d: "M24 30 L14 40 L-4 8 L6 -2 Z" }]],
  mc: [["circle", { cx: 10, cy: 16, r: 6 }]],
  circle: [["circle", { cx: 10, cy: 16, r: 6 }]],
  mr: [["path", { d: "M10 6 L16 16 L10 26 L4 16 Z" }]],
  rhombus: [["path", { d: "M10 6 L16 16 L10 26 L4 16 Z" }]],
  tt: [["path", { d: "M10 0 L20 12 L0 12 Z" }]],
  triangle_top: [["path", { d: "M10 0 L20 12 L0 12 Z" }]],
  bt: [["path", { d: "M0 26 L20 26 L10 40 Z" }]],
  triangle_bottom: [["path", { d: "M0 26 L20 26 L10 40 Z" }]]
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
  initCopyIpButton(normalizedConfig.serverIp);
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
