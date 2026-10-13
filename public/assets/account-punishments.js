import { publicPunishmentLink, punishmentReason } from "./punishment-presentation.js?v=1";
let root = document.querySelector("#account-punishment-bindings");

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function api(path, options = {}) {
  if (!new Set(["/api/appeals/bindings", "/api/appeals/revalidate"]).has(path)
      && !/^\/api\/appeals\/punishments\?(?:scope=(?:ACTIVE|EXPIRED|ALL))(?:&cursor=[A-Za-z0-9_-]{1,256})?$/.test(path)) {
    throw new Error("Unsupported punishment binding route");
  }
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
    const code = typeof payload.error === "string" ? payload.error : payload.error?.code?.toLowerCase();
    const error = new Error(code || `HTTP_${response.status}`);
    error.status = response.status;
    error.code = code || null;
    throw error;
  }
  return payload;
}

function stateText(binding) {
  if (binding.eligibilityState === "CODE_ROTATED") return "Code changed — bind the latest punishment code again.";
  if (binding.eligible) return "Ready to appeal";
  return String(binding.eligibilityState || "Not eligible").replace(/_/g, " ").toLowerCase();
}

function errorText(error) {
  if (error.code === "punishment_code_rotated" || error.status === 409) {
    return "The punishment code changed. Bind the newest code again before appealing.";
  }
  if (error.status === 429) return "Too many checks were made. Try again in a few minutes.";
  if (error.status === 404) return "This punishment is no longer bound to this account.";
  return "The punishment could not be checked right now.";
}

async function revalidate(binding, button, status) {
  button.disabled = true;
  status.textContent = "Checking with Staff…";
  try {
    await api("/api/appeals/revalidate", {
      method: "POST",
      body: JSON.stringify({ punishmentId: binding.punishmentId })
    });
    await loadBindings();
  } catch (error) {
    status.textContent = errorText(error);
    button.disabled = false;
    if (error.status === 409) setTimeout(() => void loadBindings(), 1200);
  }
}

function bindingRow(binding) {
  const row = element("li", "account-link-row");
  const details = element("a", "account-owned-punishment-details account-punishment-record-link");
  details.href = publicPunishmentLink({ caseId: binding.caseId, player: binding.boundUsername });
  details.append(
    element("strong", "", `${binding.boundUsername} · ${binding.punishmentType}`),
    element("span", "", "View public record")
  );
  const actions = element("div");
  const status = element("span", "account-link-status", stateText(binding));
  const button = element("button", "account-text-button", "Recheck");
  button.type = "button";
  button.addEventListener("click", () => void revalidate(binding, button, status));
  actions.append(status, button);
  row.append(details, actions);
  return row;
}

async function loadBindings() {
  if (!root) return;
  try {
    const payload = await api("/api/appeals/bindings");
    const bindings = Array.isArray(payload.bindings) ? payload.bindings : [];
    root.hidden = false;
    root.replaceChildren(element("h3", "", "Bound punishments"));
    if (!bindings.length) {
      root.append(element("p", "account-link-status", "No punishments are bound to this website account yet."));
      return;
    }
    const list = element("ul", "account-link-list");
    list.append(...bindings.map(bindingRow));
    root.append(list);
  } catch (error) {
    if (error.status === 401) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    root.replaceChildren(
      element("h3", "", "Bound punishments"),
      element("p", "account-error", "Your bound punishments could not be loaded right now.")
    );
  }
}

function ownedPunishmentRow(punishment) {
  const row = element("li", "account-owned-punishment-row");
  const details = element("a", "account-owned-punishment-details account-punishment-record-link");
  details.href = publicPunishmentLink(punishment);
  details.append(element("strong", "", `${punishment.minecraftName} · ${punishment.type}`),
    element("span", "", punishmentReason(punishment)),
    element("span", "account-link-status", `Issued ${new Date(punishment.createdAt).toLocaleDateString()}`));
  const actions = element("div");
  if (punishment.appealable) {
    const link = element("a", "account-text-button", "Appeal");
    const query = new URLSearchParams({ minecraftUuid: punishment.minecraftUuid, punishmentId: punishment.id });
    if (!punishment.active) query.set("includeExpired", "1");
    link.href = `/appeal.html?${query}#new`;
    actions.append(link);
  } else {
    actions.append(element("span", "account-link-status", `Appeal available ${new Date(punishment.nextAppealAt).toLocaleString()}`));
  }
  row.append(details, actions);
  return row;
}

function ownedPunishmentPanel(panel, scope) {
  if (!panel) return;
  const status = element("p", "account-link-status", scope === "ACTIVE" ? "Loading punishments…" : "Expired punishments can still be appealed once every 14 days.");
  const list = element("ul", "account-owned-punishment-list");
  const button = element("button", "account-text-button", scope === "ACTIVE" ? "Load older punishments" : "Show expired punishments");
  button.type = "button";
  button.hidden = scope === "ACTIVE";
  panel.append(status, list, button);
  let cursor = null;
  let loaded = false;
  const load = async () => {
    button.disabled = true;
    status.textContent = "Loading punishments…";
    try {
      const query = new URLSearchParams({ scope });
      if (cursor) query.set("cursor", cursor);
      const payload = await api(`/api/appeals/punishments?${query}`);
      const items = Array.isArray(payload.punishments) ? payload.punishments : [];
      list.append(...items.map(ownedPunishmentRow));
      loaded = true;
      cursor = payload.nextCursor || null;
      status.textContent = list.children.length ? "Each punishment can be appealed once every 14 days." : `No ${scope.toLowerCase()} punishments on your linked accounts.`;
      button.hidden = !cursor;
      button.textContent = "Load older punishments";
    } catch (error) {
      status.textContent = error.code === "minecraft_link_required" ? "Link your Minecraft account to see its punishments." : "Punishments could not be loaded right now.";
      button.hidden = false;
      button.textContent = loaded ? "Load older punishments" : "Try again";
    } finally { button.disabled = false; }
  };
  button.addEventListener("click", () => void load());
  if (scope === "ACTIVE") void load();
}

function loadAccountPunishments() {
  root = document.querySelector("#account-punishment-bindings");
  if (root) void loadBindings();
  ownedPunishmentPanel(document.querySelector("#account-active-punishments"), "ACTIVE");
  ownedPunishmentPanel(document.querySelector("#account-expired-punishments"), "EXPIRED");
}
window.addEventListener("enthusia:account-rendered", loadAccountPunishments);
loadAccountPunishments();
