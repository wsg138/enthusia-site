const AUTH_API = "/api/competitions/auth";

function minecraftName(session) {
  return session.linkedMinecraftAccounts?.[0]?.name || null;
}

function discordName(session) {
  return session.discord?.globalName || session.discord?.username || "Discord account";
}

function avatarUrl(session) {
  const { id, avatarHash } = session.discord ?? {};
  return id && avatarHash ? `https://cdn.discordapp.com/avatars/${id}/${avatarHash}.png?size=64` : null;
}

function returnTo() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function signInHref() {
  return `${AUTH_API}/discord/start?returnTo=${encodeURIComponent(returnTo())}`;
}

async function fetchSession() {
  try {
    const response = await fetch(`${AUTH_API}/session`, {
      credentials: "same-origin",
      headers: { accept: "application/json" }
    });
    return response.ok ? response.json() : { authenticated: false };
  } catch {
    return { authenticated: false };
  }
}

async function isStaffMember() {
  try {
    const response = await fetch("/api/competitions/admin/status", {
      credentials: "same-origin",
      headers: { accept: "application/json" }
    });
    return response.status === 200 || response.status === 503;
  } catch {
    return false;
  }
}

async function signOut(button) {
  button.disabled = true;
  try {
    const response = await fetch(`${AUTH_API}/logout`, {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: "{}"
    });
    if (!response.ok) throw new Error("sign_out_failed");
    window.location.reload();
  } catch {
    button.disabled = false;
  }
}

function ensureBrandLogo() {
  const brand = document.querySelector(".site-header .brand");
  if (!brand || brand.querySelector(".brand-logo")) return;
  const image = document.createElement("img");
  image.className = "brand-logo";
  image.src = "/assets/enthusia-logo-v2.png";
  image.alt = "";
  image.width = 46;
  image.height = 46;
  brand.prepend(image);
}

function normalizeCommunityLinks() {
  const nav = document.querySelector(".site-header .nav");
  const menu = nav?.querySelector(".nav-menu");
  if (!nav || !menu) return;

  let competition = menu.querySelector('[href="/competitions/"], [href="competitions/"]');
  if (!competition) {
    competition = document.createElement("a");
    competition.href = "/competitions/";
    competition.textContent = "Competitions";
  }

  let market = menu.querySelector('a[href$="market.html"]');
  const topLevelMarket = [...nav.children].find((item) => item.matches?.('a[href$="market.html"]'));
  if (!market && topLevelMarket) market = topLevelMarket;
  if (!market) {
    market = document.createElement("a");
    market.href = "/market.html";
    market.textContent = "Market";
  }

  const wiki = menu.querySelector("a[data-link-target='wiki']");
  menu.insertBefore(market, wiki ?? null);
  menu.insertBefore(competition, wiki ?? null);
}

function normalizeActiveNavigation() {
  const nav = document.querySelector(".site-header .nav");
  if (!nav) return;

  const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
  const currentSection = currentPath === "/index.html" ? "/" : currentPath;
  let activeLink = null;

  nav.querySelectorAll("a.active, a[aria-current='page']").forEach((link) => {
    link.classList.remove("active");
    link.removeAttribute("aria-current");
  });

  nav.querySelectorAll("a[href]").forEach((link) => {
    const target = new URL(link.href, window.location.href);
    if (target.origin !== window.location.origin) return;
    const targetPath = target.pathname.replace(/\/+$/, "") || "/";
    const targetSection = targetPath === "/index.html" ? "/" : targetPath;
    const matchesCompetition = currentSection.startsWith("/competitions") && targetSection === "/competitions";
    if (targetSection === currentSection || matchesCompetition) activeLink = link;
  });

  if (activeLink) {
    activeLink.classList.add("active");
    activeLink.setAttribute("aria-current", "page");
  }

  const dropdown = nav.querySelector(".nav-dropdown");
  const trigger = dropdown?.querySelector(".nav-drop-trigger");
  const hasActiveCommunityLink = Boolean(dropdown?.querySelector(".nav-menu a.active"));
  if (trigger) {
    trigger.classList.toggle("active", hasActiveCommunityLink);
    if (hasActiveCommunityLink) trigger.setAttribute("aria-current", "page");
    else trigger.removeAttribute("aria-current");
  }
}

function ensureRoot() {
  const nav = document.querySelector(".site-header .nav");
  if (!nav) return null;
  let root = nav.querySelector("[data-site-account]");
  if (!root) {
    root = document.createElement("span");
    root.className = "site-account";
    root.dataset.siteAccount = "";
    nav.append(root);
  }
  return root;
}

function menuLink(label, href) {
  const link = document.createElement("a");
  link.href = href;
  link.textContent = label;
  return link;
}

async function renderAccount(root, session) {
  root.replaceChildren();
  if (!session.authenticated) {
    const signIn = menuLink("Sign in", signInHref());
    signIn.className = "site-account-sign-in";
    root.append(signIn);
    return;
  }

  const details = document.createElement("details");
  details.className = "site-account-menu";
  const summary = document.createElement("summary");
  summary.title = session.discord?.username || discordName(session);
  const avatar = document.createElement("span");
  avatar.className = "site-account-avatar";
  const imageUrl = avatarUrl(session);
  if (imageUrl) {
    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = "";
    avatar.append(image);
  } else {
    avatar.textContent = discordName(session).slice(0, 1).toUpperCase();
  }
  const identity = document.createElement("span");
  identity.className = "site-account-identity";
  const primary = document.createElement("strong");
  primary.textContent = minecraftName(session) || discordName(session);
  const secondary = document.createElement("small");
  secondary.textContent = minecraftName(session)
    ? `@${session.discord?.username || discordName(session)}`
    : "Minecraft account not linked";
  identity.append(primary, secondary);
  summary.append(avatar, identity);
  const actions = document.createElement("div");
  actions.className = "site-account-actions";
  actions.append(menuLink("Competitions", "/competitions/"), menuLink("Appeal a punishment", "/appeal.html"));
  if (await isStaffMember()) actions.append(menuLink("Staff workspace", "/competitions/admin/"));
  const logout = document.createElement("button");
  logout.type = "button";
  logout.textContent = "Sign out";
  logout.dataset.siteSignOut = "";
  actions.append(logout);
  details.append(summary, actions);
  root.append(details);
}

document.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-site-sign-out]");
  if (button) signOut(button);
});

export async function initSiteAccount() {
  ensureBrandLogo();
  normalizeCommunityLinks();
  normalizeActiveNavigation();
  const root = ensureRoot();
  if (!root) return;
  root.setAttribute("aria-label", "Site account");
  await renderAccount(root, await fetchSession());
}

initSiteAccount();
