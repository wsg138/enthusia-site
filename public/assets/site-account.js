const AUTH_API = "/api/competitions/auth";

function accountLabel(session) {
  return session.linkedMinecraftAccounts?.[0]?.name
    || session.discord?.globalName
    || session.discord?.username
    || "Account";
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

function ensureCompetitionLink() {
  const menu = document.querySelector(".site-header .nav-menu");
  if (!menu || menu.querySelector('[href="/competitions/"], [href="competitions/"]')) return;
  const link = document.createElement("a");
  link.href = "/competitions/";
  link.textContent = "Competitions";
  menu.prepend(link);
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
  summary.textContent = accountLabel(session);
  summary.title = session.discord?.username || accountLabel(session);
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
  ensureCompetitionLink();
  const root = ensureRoot();
  if (!root) return;
  root.setAttribute("aria-label", "Site account");
  await renderAccount(root, await fetchSession());
}

initSiteAccount();
