(() => {
  const API = "/api/competitions/auth";
  let cachedSession = null;
  let panel = null;
  let pollTimer = null;

  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  async function jsonRequest(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers: {
        accept: "application/json",
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers ?? {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `HTTP_${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  async function session({ refresh = false } = {}) {
    if (cachedSession && !refresh) return cachedSession;
    cachedSession = await jsonRequest(`${API}/session`);
    return cachedSession;
  }

  function currentReturnTo() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  function signInUrl() {
    return `${API}/discord/start?returnTo=${encodeURIComponent(currentReturnTo())}`;
  }

  function ensurePanel() {
    if (panel?.isConnected) return panel;
    const main = document.querySelector(".competition-detail-content") || document.querySelector(".page-main .container") || document.querySelector("main");
    if (!main) return null;
    panel = el("section", "competition-account-panel card");
    panel.setAttribute("aria-live", "polite");
    const tabs = document.querySelector(".competition-detail-tabs");
    if (tabs?.parentNode) tabs.parentNode.insertBefore(panel, tabs);
    else main.prepend(panel);
    return panel;
  }

  function accountLabel(account) {
    return `${account.name} · ${account.uuid}`;
  }

  async function unlink(uuid, button) {
    if (!window.confirm("Unlink this Minecraft account from your Discord competition account? Existing competition history remains attached to the Discord account.")) return;
    button.disabled = true;
    try {
      await jsonRequest(`${API}/link`, {
        method: "POST",
        body: JSON.stringify({ action: "UNLINK", minecraftUuid: uuid })
      });
      await render({ refresh: true });
      window.dispatchEvent(new CustomEvent("competition-identity-changed"));
    } catch (error) {
      window.alert(String(error?.payload?.error ?? error?.message ?? "unlink_failed").replaceAll("_", " "));
      button.disabled = false;
    }
  }

  async function pollLink(requestId, expiresAt, status, startButton) {
    if (pollTimer) clearTimeout(pollTimer);
    const expiry = Date.parse(expiresAt);
    if (!Number.isFinite(expiry) || Date.now() >= expiry) {
      status.textContent = "That link code expired. Start a new link request.";
      startButton.disabled = false;
      return;
    }
    try {
      const result = await jsonRequest(`${API}/link`, {
        method: "POST",
        body: JSON.stringify({ action: "POLL", requestId })
      });
      if (["LINKED", "ALREADY_LINKED_TO_YOU"].includes(result.status)) {
        status.textContent = `${result.minecraft?.name || "Minecraft account"} linked successfully.`;
        await render({ refresh: true });
        window.dispatchEvent(new CustomEvent("competition-identity-changed"));
        return;
      }
      if (result.status === "WAITING_FOR_MINECRAFT") {
        pollTimer = setTimeout(() => pollLink(requestId, expiresAt, status, startButton), 1800);
        return;
      }
      status.textContent = "The link request is no longer active.";
      startButton.disabled = false;
    } catch (error) {
      if (error.status === 410) {
        status.textContent = "That link code expired. Start a new link request.";
        startButton.disabled = false;
        return;
      }
      // Temporary bridge/network errors do not consume the browser-side request.
      status.textContent = "Waiting for the server…";
      pollTimer = setTimeout(() => pollLink(requestId, expiresAt, status, startButton), 3000);
    }
  }

  async function startLink(status, command, startButton) {
    startButton.disabled = true;
    status.textContent = "Creating a 5-minute link code…";
    command.textContent = "";
    try {
      const result = await jsonRequest(`${API}/link`, {
        method: "POST",
        body: JSON.stringify({ action: "START" })
      });
      command.textContent = result.command || `/competitionlink ${result.code}`;
      status.textContent = "Run this command in-game within 5 minutes. This page will update automatically.";
      pollLink(result.requestId, result.expiresAt, status, startButton);
    } catch (error) {
      status.textContent = String(error?.payload?.error ?? error?.message ?? "link_start_failed").replaceAll("_", " ");
      startButton.disabled = false;
    }
  }

  async function logout(button) {
    button.disabled = true;
    try {
      await jsonRequest(`${API}/logout`, { method: "POST", body: JSON.stringify({}) });
      cachedSession = null;
      await render({ refresh: true });
      window.dispatchEvent(new CustomEvent("competition-identity-changed"));
    } catch {
      button.disabled = false;
    }
  }

  async function render({ refresh = false } = {}) {
    const root = ensurePanel();
    if (!root) return null;
    root.replaceChildren(el("p", "competition-account-muted", "Loading competition account…"));
    let state;
    try {
      state = await session({ refresh });
    } catch {
      root.replaceChildren(el("p", "competition-account-error", "Competition account service is temporarily unavailable."));
      return null;
    }

    if (!state.authenticated) {
      const copy = el("div", "competition-account-copy");
      copy.append(
        el("strong", "", "Competition account"),
        el("span", "competition-account-muted", "Sign in with Discord to submit, vote, accept contributor invites, or judge.")
      );
      const signIn = document.createElement("a");
      signIn.className = "competition-primary-action";
      signIn.href = signInUrl();
      signIn.textContent = "Sign in with Discord";
      root.replaceChildren(copy, signIn);
      return state;
    }

    const heading = el("div", "competition-account-heading");
    const identity = el("div", "competition-account-copy");
    const displayName = state.discord?.globalName || state.discord?.username || "Discord account";
    identity.append(
      el("strong", "", displayName),
      el("span", "competition-account-muted", `${state.linkedMinecraftAccounts?.length ?? 0} linked Minecraft account${state.linkedMinecraftAccounts?.length === 1 ? "" : "s"}`)
    );
    const logoutButton = el("button", "competition-account-secondary", "Sign out");
    logoutButton.type = "button";
    logoutButton.addEventListener("click", () => logout(logoutButton));
    heading.append(identity, logoutButton);

    const links = el("div", "competition-account-links");
    for (const account of state.linkedMinecraftAccounts ?? []) {
      const row = el("div", "competition-account-link-row");
      row.append(el("span", "", accountLabel(account)));
      const unlinkButton = el("button", "competition-account-text-button", "Unlink");
      unlinkButton.type = "button";
      unlinkButton.addEventListener("click", () => unlink(account.uuid, unlinkButton));
      row.append(unlinkButton);
      links.append(row);
    }
    if (!(state.linkedMinecraftAccounts ?? []).length) {
      links.append(el("p", "competition-account-warning", "Link at least one Minecraft account before submitting or voting."));
    }

    const linker = el("div", "competition-linker");
    const startButton = el("button", "competition-account-secondary", "Link another Minecraft account");
    startButton.type = "button";
    const status = el("p", "competition-account-muted", "Linking works in either direction through a short-lived server code.");
    const command = el("code", "competition-link-command");
    startButton.addEventListener("click", () => startLink(status, command, startButton));
    linker.append(startButton, status, command);

    root.replaceChildren(heading, links, linker);
    return state;
  }

  async function requireLinked() {
    const state = await render();
    return state?.authenticated && Array.isArray(state.linkedMinecraftAccounts) && state.linkedMinecraftAccounts.length
      ? state
      : null;
  }

  window.EnthusiaCompetitionIdentity = Object.freeze({
    render,
    requireLinked,
    session,
    signInUrl
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => render().catch(() => {}), { once: true });
  else render().catch(() => {});
})();
