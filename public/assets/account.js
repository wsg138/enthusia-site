const API = "/api/competitions/auth";
const root = document.querySelector("#account-session");
let pollTimer = null;

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function signInHref() {
  return `${API}/discord/start?returnTo=${encodeURIComponent("/account.html")}`;
}

async function request(path, options = {}) {
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
    throw error;
  }
  return payload;
}

function discordName(session) {
  return session.discord?.globalName || session.discord?.username || "Discord account";
}

function showAccountLoadError() {
  root.replaceChildren(element("p", "account-error", "Your account could not be loaded. Refresh the page to try again."));
}

function signOut(button) {
  button.disabled = true;
  request(`${API}/logout`, { method: "POST", body: "{}" })
    .then(() => window.location.reload())
    .catch(() => {
      button.disabled = false;
    });
}

async function unlink(account, button) {
  if (!window.confirm(`Unlink ${account.name} from this Discord account?`)) return;
  button.disabled = true;
  try {
    await request(`${API}/link`, {
      method: "POST",
      body: JSON.stringify({ action: "UNLINK", minecraftUuid: account.uuid })
    });
    await render();
  } catch (error) {
    button.disabled = false;
    window.alert("That Minecraft account could not be unlinked.");
  }
}

async function pollLink(requestId, expiresAt, status, button) {
  if (pollTimer) clearTimeout(pollTimer);
  if (Date.now() >= Date.parse(expiresAt)) {
    status.textContent = "The link code expired. Generate a new one when you are ready.";
    button.disabled = false;
    return;
  }
  try {
    const payload = await request(`${API}/link`, {
      method: "POST",
      body: JSON.stringify({ action: "POLL", requestId })
    });
    if (["LINKED", "ALREADY_LINKED_TO_YOU"].includes(payload.status)) {
      await render();
      return;
    }
    if (payload.status === "WAITING_FOR_MINECRAFT") {
      pollTimer = setTimeout(() => pollLink(requestId, expiresAt, status, button), 1800);
      return;
    }
    status.textContent = "The link code is no longer active.";
    button.disabled = false;
  } catch (error) {
    if (error.status === 410) {
      status.textContent = "The link code expired. Generate a new one when you are ready.";
      button.disabled = false;
      return;
    }
    status.textContent = "Waiting for the server…";
    pollTimer = setTimeout(() => pollLink(requestId, expiresAt, status, button), 3000);
  }
}

async function startLink(button, output, status) {
  try {
    button.disabled = true;
    output.textContent = "";
    status.textContent = "Generating a link code…";
    const payload = await request(`${API}/link`, {
      method: "POST",
      body: JSON.stringify({ action: "START" })
    });
    output.textContent = payload.command || `/competitionlink ${payload.code}`;
    status.textContent = "Run this command in-game. This page will update when the account is linked.";
    await pollLink(payload.requestId, payload.expiresAt, status, button);
  } catch (error) {
    status.textContent = "Account linking is unavailable right now.";
    button.disabled = false;
  }
}

function accountRow(account) {
  const row = element("li", "account-link-row");
  const copy = element("div");
  copy.append(element("strong", "", account.name), element("span", "", account.uuid));
  const button = element("button", "account-text-button", "Unlink");
  button.type = "button";
  button.addEventListener("click", () => unlink(account, button));
  row.append(copy, button);
  return row;
}

function signedOut() {
  root.replaceChildren();
  const section = element("div", "account-signed-out");
  section.append(
    element("p", "card-kicker", "Your account"),
    element("h2", "", "Sign in with Discord"),
    element("p", "", "Sign in to view or change your linked Minecraft accounts.")
  );
  const link = element("a", "btn", "Sign in");
  link.href = signInHref();
  section.append(link);
  root.append(section);
}

function signedIn(session) {
  root.replaceChildren();
  const header = element("header", "account-session-header");
  const identity = element("div");
  identity.append(
    element("p", "card-kicker", "Signed in with Discord"),
    element("h2", "", discordName(session)),
    element("p", "", `@${session.discord.username}`)
  );
  const signOutButton = element("button", "btn ghost", "Sign out");
  signOutButton.type = "button";
  signOutButton.addEventListener("click", () => signOut(signOutButton));
  header.append(identity, signOutButton);

  const links = element("section", "account-links");
  links.append(element("h3", "", "Linked Minecraft accounts"));
  const list = element("ul", "account-link-list");
  if (session.linkedMinecraftAccounts?.length) {
    list.append(...session.linkedMinecraftAccounts.map(accountRow));
  } else {
    list.append(element("li", "account-link-empty", "No Minecraft accounts are linked."));
  }
  links.append(list);

  const linker = element("section", "account-linker");
  linker.append(element("h3", "", "Link another account"));
  const copy = element("p", "", "Generate a code when you are ready to finish the link in-game.");
  const button = element("button", "btn", "Generate link code");
  button.type = "button";
  const command = element("code", "account-link-command");
  const status = element("p", "account-link-status");
  status.setAttribute("role", "status");
  button.addEventListener("click", () => {
    void startLink(button, command, status);
  });
  linker.append(copy, button, command, status);

  root.append(header, links, linker);
}

async function render() {
  if (pollTimer) clearTimeout(pollTimer);
  try {
    const session = await request(`${API}/session`);
    if (session.authenticated) signedIn(session);
    else signedOut();
  } catch (error) {
    showAccountLoadError();
  }
}

render().catch(showAccountLoadError);
