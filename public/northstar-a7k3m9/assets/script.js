const STATUS_REFRESH_INTERVAL_MS = 60000;
const SCREENSHOT_AUTOPLAY_MS = 1500;
const SCREENSHOT_MANUAL_PAUSE_MS = 5000;
const STAFF_SCROLL_SPEED_PX_PER_SECOND = 28;

let stopStaffCarouselMotion = null;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
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
  const capacityEl = document.getElementById("serverCapacity");

  if (ipEl) {
    ipEl.textContent = isConfiguredValue(ip) ? ip : "Unavailable";
  }

  if (!statusEl || !countEl) {
    return;
  }

  if (!isConfiguredValue(ip)) {
    countEl.textContent = "--";
    if (capacityEl) capacityEl.textContent = "Server IP unavailable";
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
      const online = typeof data.players?.online === "number" ? data.players.online : null;
      const max = typeof data.players?.max === "number" ? data.players.max : null;
      countEl.textContent = online === null ? "--" : String(online);
      if (capacityEl) capacityEl.textContent = max === null ? "Live player count" : `${max} slots listed`;
      setStatusBadge(statusEl, "Online", "online");
      return;
    }

    countEl.textContent = "--";
    if (capacityEl) capacityEl.textContent = "Player count unavailable";
    setStatusBadge(statusEl, "Offline", "offline");
  } catch {
    countEl.textContent = "--";
    if (capacityEl) capacityEl.textContent = "Could not reach status API";
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

const BANNER_COLORS = Object.freeze({
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
  black: "#1d1d21",
});

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

function appendBannerPattern(group, code, color) {
  const fill = color;
  switch (code) {
    case "bs":
    case "stripe_bottom":
      group.append(createSvgNode("rect", { x: 0, y: 26, width: 20, height: 8, fill }));
      break;
    case "ts":
    case "stripe_top":
      group.append(createSvgNode("rect", { x: 0, y: 0, width: 20, height: 8, fill }));
      break;
    case "ls":
    case "stripe_left":
      group.append(createSvgNode("rect", { x: 0, y: 0, width: 6, height: 40, fill }));
      break;
    case "rs":
    case "stripe_right":
      group.append(createSvgNode("rect", { x: 14, y: 0, width: 6, height: 40, fill }));
      break;
    case "cs":
    case "stripe_center":
      group.append(createSvgNode("rect", { x: 7, y: 0, width: 6, height: 40, fill }));
      break;
    case "ms":
    case "stripe_middle":
      group.append(createSvgNode("rect", { x: 0, y: 16, width: 20, height: 8, fill }));
      break;
    case "bo":
    case "border":
      group.append(createSvgNode("rect", { x: 0, y: 0, width: 20, height: 4, fill }));
      group.append(createSvgNode("rect", { x: 0, y: 0, width: 4, height: 40, fill }));
      group.append(createSvgNode("rect", { x: 16, y: 0, width: 4, height: 40, fill }));
      group.append(createSvgNode("rect", { x: 0, y: 30, width: 20, height: 10, fill }));
      break;
    case "cr":
    case "cross":
      group.append(createSvgNode("rect", { x: 7, y: 0, width: 6, height: 40, fill }));
      group.append(createSvgNode("rect", { x: 0, y: 16, width: 20, height: 8, fill }));
      break;
    case "sc":
    case "straight_cross":
    case "saltire":
      group.append(createSvgNode("path", { d: "M-4 4 L4 -4 L24 28 L16 36 Z", fill }));
      group.append(createSvgNode("path", { d: "M24 4 L16 -4 L-4 28 L4 36 Z", fill }));
      break;
    case "dls":
    case "diagonal_left":
      group.append(createSvgNode("path", { d: "M-4 30 L6 40 L24 8 L14 -2 Z", fill }));
      break;
    case "drs":
    case "diagonal_right":
      group.append(createSvgNode("path", { d: "M24 30 L14 40 L-4 8 L6 -2 Z", fill }));
      break;
    case "mc":
    case "circle":
      group.append(createSvgNode("circle", { cx: 10, cy: 16, r: 6, fill }));
      break;
    case "mr":
    case "rhombus":
      group.append(createSvgNode("path", { d: "M10 6 L16 16 L10 26 L4 16 Z", fill }));
      break;
    case "tt":
    case "triangle_top":
      group.append(createSvgNode("path", { d: "M10 0 L20 12 L0 12 Z", fill }));
      break;
    case "bt":
    case "triangle_bottom":
      group.append(createSvgNode("path", { d: "M0 26 L20 26 L10 40 Z", fill }));
      break;
    default:
      break;
  }
}

function createGuildBannerVisual(banner) {
  if (!banner || typeof banner !== "object") {
    return null;
  }

  const clipId = `guild-banner-clip-${Math.random().toString(36).slice(2, 9)}`;
  const svg = createSvgNode("svg", {
    viewBox: "0 0 20 40",
    class: "guild-banner",
    role: "img",
    "aria-hidden": "true",
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
    fill: normalizeBannerColor(banner.baseColor || banner.base || banner.color || banner.base_color || "black"),
  }));

  const patterns = Array.isArray(banner.patterns) ? banner.patterns : [];
  patterns.forEach((pattern) => appendBannerPattern(group, getPatternCode(pattern), getPatternColor(pattern)));
  svg.append(group);
  svg.append(createSvgNode("path", {
    d: "M2 2 H18 V30 L10 38 L2 30 Z",
    fill: "none",
    stroke: "rgba(255,241,199,0.26)",
    "stroke-width": 1,
  }));

  return svg;
}

function createLeaderboardEntry(board, entry, rank) {
  const item = document.createElement("li");

  const rankEl = document.createElement("span");
  rankEl.className = "rank";
  rankEl.textContent = String(rank);

  let visual;
  if (board.mode === "guild") {
    visual = createGuildBannerVisual(entry?.banner);
    if (!visual) {
      const topMemberUuid = Array.isArray(entry?.topMemberUuids) ? normalizeText(entry.topMemberUuids[0]) : "";
      if (topMemberUuid) {
        visual = document.createElement("img");
        visual.src = `https://minotar.net/helm/${encodeURIComponent(topMemberUuid)}/64`;
        visual.alt = "";
        visual.width = 40;
        visual.height = 40;
        visual.loading = "lazy";
        visual.decoding = "async";
        visual.className = "guild-fallback-head";
      } else {
        visual = document.createElement("span");
        visual.className = "guild-mark";
        visual.textContent = normalizeText(entry?.iconText || entry?.tag || entry?.name || "G").slice(0, 3).toUpperCase();
      }
    }
  } else {
    visual = document.createElement("img");
    const username = normalizeText(entry?.username || entry?.displayName || entry?.name || "Steve");
    visual.src = `https://minotar.net/helm/${encodeURIComponent(username)}/64`;
    visual.alt = "";
    visual.width = 40;
    visual.height = 40;
    visual.loading = "lazy";
    visual.decoding = "async";
  }

  const identity = document.createElement("span");
  identity.className = "leader-name";

  const name = document.createElement("strong");
  name.textContent = normalizeText(entry?.displayName || entry?.name || entry?.username || entry?.tag || `Rank ${rank}`);
  identity.append(name);

  const detail = normalizeText(entry?.subtext || entry?.subtitle || entry?.tag || "");
  if (detail) {
    const detailEl = document.createElement("small");
    detailEl.textContent = detail;
    identity.append(detailEl);
  }

  const value = document.createElement("span");
  value.textContent = normalizeText(entry?.value || entry?.stat || entry?.score || "--");

  item.append(rankEl, visual, identity, value);
  return item;
}

function createLeaderboardBoardCard(board, active = true) {
  const article = document.createElement("article");
  article.className = "card board-card";
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

function normalizeLeaderboardEntries(payload, board) {
  const collection = Array.isArray(payload)
    ? payload
    : payload?.players || payload?.guilds || payload?.entries || payload?.data || [];

  if (!Array.isArray(collection)) {
    return [];
  }

  return collection
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      if (board.mode === "guild") {
        const level = Number(entry.level);
        const totalExperience = Number(entry.totalExperience);
        const memberCount = Number(entry.memberCount);

        return {
          name: normalizeText(entry.name || entry.guild_name || entry.tagPlain || entry.tag),
          displayName: normalizeText(entry.name || entry.guild_name || entry.tagPlain || entry.tag),
          tag: normalizeText(entry.tagPlain || entry.tag || ""),
          subtext: [
            Number.isFinite(memberCount) ? `${formatNumber(memberCount)} members` : "",
            Number.isFinite(totalExperience) ? `${formatNumber(totalExperience)} XP` : "",
          ].filter(Boolean).join(" | "),
          value: Number.isFinite(level) ? `Lv ${formatNumber(level)}` : (Number.isFinite(totalExperience) ? `${formatNumber(totalExperience)} XP` : ""),
          banner: entry.banner,
          topMemberUuids: Array.isArray(entry.topMemberUuids) ? entry.topMemberUuids : [],
          rank: Number.isFinite(entry.rank) ? entry.rank : index + 1,
        };
      }

      return {
        name: normalizeText(entry.name || entry.username || entry.displayName || entry.guild_name),
        displayName: normalizeText(entry.displayName || entry.name || entry.username || entry.guild_name),
        username: normalizeText(entry.username || entry.player || ""),
        tag: normalizeText(entry.tag || entry.guildTag || entry.guild_tag || ""),
        subtext: normalizeText(entry.subtext || entry.subtitle || entry.description || ""),
        value: normalizeText(
          entry.value
          || entry.stat
          || entry.score
          || entry.formatted
          || entry.formattedValue
          || entry.amount
          || entry.hours
          || entry.balance
          || entry.experience
          || entry.level
          || ""
        ),
        rank: Number.isFinite(entry.rank) ? entry.rank : index + 1,
      };
    })
    .filter(Boolean)
    .filter((entry) => entry.displayName && entry.value)
    .slice(0, Number.isFinite(board.limit) ? board.limit : collection.length);
}

async function fetchLeaderboardEntries(board) {
  const endpoint = normalizeText(board?.endpoint) || (normalizeText(board?.source) ? `/api/leaderboards/${normalizeText(board.source)}` : "");
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

  activeBoards.forEach((board) => {
    const card = createLeaderboardBoardCard(board, true);
    activeRoot.append(card.article);
    void populateLeaderboardBoard(board, card, true);
  });

  upcomingBoards.forEach((board) => {
    const card = createLeaderboardBoardCard(board, false);
    upcomingRoot.append(card.article);
  });

  if (upcomingSection) {
    upcomingSection.hidden = upcomingBoards.length === 0;
  }

  if (summaryLive) {
    summaryLive.textContent = String(activeBoards.length);
  }

  if (summarySpots) {
    summarySpots.textContent = "18";
  }

  if (summaryUpcoming) {
    summaryUpcoming.textContent = String(upcomingBoards.length);
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
    wikiUrl: normalizeText(cfg?.wikiUrl),
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
