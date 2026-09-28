const root = document.querySelector("#account-punishment-bindings");

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function api(path, options = {}) {
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
    error.code = payload.error || null;
    throw error;
  }
  return payload;
}

function stateText(binding) {
  if (binding.eligibilityState === "CODE_ROTATED") return "Code changed — bind the latest punishment code again.";
  if (binding.eligible) return "Ready to appeal";
  return String(binding.eligibilityState || "Not eligible").replaceAll("_", " ").toLowerCase();
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
  const details = element("div");
  details.append(
    element("strong", "", `${binding.boundUsername} · ${binding.punishmentType}`),
    element("span", "", `Case ${binding.caseId}`)
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

void loadBindings();
