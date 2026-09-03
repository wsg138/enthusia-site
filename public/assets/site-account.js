import { normalizeSiteNavigation } from "./site-navigation.js";

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

function appealNeedsReply(appeal) {
  if (appeal?.status !== "INFORMATION_REQUESTED") return false;
  const comments = Array.isArray(appeal.comments) ? appeal.comments : [];
  return comments.at(-1)?.authorType === "STAFF";
}

async function appealReplyCount() {
  try {
    const response = await fetch("/api/appeals", {
      credentials: "same-origin",
      headers: { accept: "application/json" }
    });
    if (!response.ok) return 0;
    const payload = await response.json();
    return Array.isArray(payload.appeals) ? payload.appeals.filter(appealNeedsReply).length : 0;
  } catch {
    return 0;
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

function menuLink(label, href, description) {
  const link = document.createElement("a");
  link.href = href;
  if (!description) {
    link.textContent = label;
    return link;
  }
  const copy = document.createElement("span");
  const title = document.createElement("strong");
  const detail = document.createElement("small");
  title.textContent = label;
  detail.textContent = description;
  copy.append(title, detail);
  link.append(copy);
  return link;
}

function showAppealReplyCount(link, count) {
  if (!Number.isSafeInteger(count) || count < 1) return;
  const title = link.querySelector("strong");
  const detail = link.querySelector("small");
  if (!title || !detail) return;
  const badge = document.createElement("span");
  badge.className = "site-account-alert-count";
  badge.textContent = String(count);
  badge.setAttribute("aria-label", `${count} appeal${count === 1 ? "" : "s"} need your reply`);
  title.append(badge);
  detail.textContent = count === 1 ? "One appeal needs your reply" : `${count} appeals need your reply`;
}

function closeAccountMenus(except = null) {
  for (const menu of document.querySelectorAll(".site-account-menu[open]")) {
    if (menu !== except) menu.removeAttribute("open");
  }
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
  summary.title = "Open account menu";
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
  primary.textContent = discordName(session);
  const secondary = document.createElement("small");
  secondary.textContent = minecraftName(session) || "No Minecraft account linked";
  identity.append(primary, secondary);
  summary.append(avatar, identity);
  const actions = document.createElement("div");
  actions.className = "site-account-actions";
  const appealsLink = menuLink("Appeals", "/appeal.html#history", "Status and staff replies");
  actions.append(
    menuLink("Profile", "/account.html", "Discord and Minecraft links"),
    appealsLink,
    menuLink("Competitions", "/competitions/", "Entries, voting, and results")
  );
  const logout = document.createElement("button");
  logout.type = "button";
  logout.textContent = "Sign out";
  logout.className = "site-account-sign-out";
  logout.dataset.siteSignOut = "";
  actions.append(logout);
  details.append(summary, actions);
  root.append(details);
  const [staffMember, replyCount] = await Promise.all([isStaffMember(), appealReplyCount()]);
  showAppealReplyCount(appealsLink, replyCount);
  if (staffMember) {
    actions.insertBefore(
      menuLink("Review appeals", "/reviewer/appeals.html", "Open the staff appeal queue"),
      logout
    );
    actions.insertBefore(
      menuLink("Competition tools", "/competitions/admin/", "Manage competitions"),
      logout
    );
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-site-sign-out]");
  if (button) signOut(button);
  const currentMenu = event.target.closest?.(".site-account-menu") ?? null;
  closeAccountMenus(currentMenu);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeAccountMenus();
});

window.addEventListener("scroll", () => closeAccountMenus(), { passive: true });

export async function initSiteAccount() {
  ensureBrandLogo();
  normalizeSiteNavigation();
  const root = ensureRoot();
  if (!root) return;
  root.setAttribute("aria-label", "Site account");
  await renderAccount(root, await fetchSession());
}

initSiteAccount();
