const AUTH_API = "/api/competitions/auth";

function accountLabel(session) {
  const minecraft = session.linkedMinecraftAccounts?.[0]?.name;
  return minecraft || session.discord?.globalName || session.discord?.username || "Account";
}

function signInHref() {
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `${AUTH_API}/discord/start?returnTo=${encodeURIComponent(returnTo)}`;
}

async function isStaffMember() {
  try {
    const response = await fetch("/api/competitions/admin/status", {
      credentials: "same-origin",
      headers: { accept: "application/json" }
    });
    // Staff can open the workspace even while its readiness panel reports a
    // missing optional integration, which deliberately returns HTTP 503.
    return response.status === 200 || response.status === 503;
  } catch {
    return false;
  }
}

async function signOut() {
  const response = await fetch(`${AUTH_API}/logout`, {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: "{}"
  });
  if (!response.ok) throw new Error("sign_out_failed");
  window.dispatchEvent(new CustomEvent("competition-identity-changed"));
}

function link(label, href, className = "") {
  const item = document.createElement("a");
  item.className = className;
  item.href = href;
  item.textContent = label;
  return item;
}

async function renderAccountNavigation() {
  const roots = [...document.querySelectorAll("[data-competition-nav-account]")];
  if (!roots.length) return;
  let session = { authenticated: false };
  try {
    const response = await fetch(`${AUTH_API}/session`, { credentials: "same-origin", headers: { accept: "application/json" } });
    if (response.ok) session = await response.json();
  } catch {
    // The sign-in control remains available when the account service is down.
  }

  for (const root of roots) {
    root.replaceChildren();
    if (!session.authenticated) {
      root.append(link("Sign in", signInHref(), "competition-nav-sign-in"));
      continue;
    }

    const name = document.createElement("span");
    name.className = "competition-nav-identity";
    name.title = session.discord?.username || accountLabel(session);
    name.textContent = accountLabel(session);
    root.append(name);

    if (await isStaffMember()) root.append(link("Staff", "admin/", "competition-nav-staff"));

    const logout = document.createElement("button");
    logout.type = "button";
    logout.className = "competition-nav-sign-out";
    logout.textContent = "Sign out";
    logout.addEventListener("click", async () => {
      logout.disabled = true;
      try { await signOut(); } catch { logout.disabled = false; }
    });
    root.append(logout);
  }
}

window.addEventListener("competition-identity-changed", () => window.location.reload());
renderAccountNavigation();
