const STATUS_REFRESH_INTERVAL_MS = 60000;

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
    countEl.textContent = "—";
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
      countEl.textContent = typeof data.players?.online === "number" ? String(data.players.online) : "—";
      setStatusBadge(statusEl, "Online", "online");
      return;
    }

    countEl.textContent = "—";
    setStatusBadge(statusEl, "Offline", "offline");
  } catch {
    countEl.textContent = "—";
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

    cardRoot.replaceChildren();

    const card = createDiscordCard("Discord");
    const counts = document.createElement("div");
    counts.className = "discord-counts";

    const countPill = document.createElement("span");
    countPill.className = "pill";

    const dot = document.createElement("span");
    dot.className = "dot";
    dot.setAttribute("aria-hidden", "true");

    countPill.append(dot, document.createTextNode(`${members.length} online`));
    counts.append(countPill);
    card.querySelector(".discord-head")?.append(counts);

    const avatars = document.createElement("div");
    avatars.className = "discord-avatars";

    members.slice(0, 12).forEach((member) => {
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
  };

  setExternalLinkTargets(normalizedConfig);
  initCopyIpButton(normalizedConfig.serverIp);
  await updateServerStatus(normalizedConfig.serverIp);

  if (document.getElementById("serverStatus") && isConfiguredValue(normalizedConfig.serverIp)) {
    window.setInterval(() => {
      void updateServerStatus(normalizedConfig.serverIp);
    }, STATUS_REFRESH_INTERVAL_MS);
  }

  await renderDiscordWidget(normalizedConfig);
}

document.addEventListener("DOMContentLoaded", () => {
  void initSite(window.ENTHUSIA || {});
});
