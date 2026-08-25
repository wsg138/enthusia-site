const authRoot = document.querySelector("#appeal-auth");
const form = document.querySelector("#appeal-form");
const fields = document.querySelector("#appeal-fields");
const username = document.querySelector("#appeal-username");
const code = document.querySelector("#appeal-code");
const reason = document.querySelector("#appeal-reason");
const verifyButton = document.querySelector("#verify-punishment");
const verifyResult = document.querySelector("#verify-result");
const verifiedRoot = document.querySelector("#verified-punishment");
const submitButton = document.querySelector("#submit-appeal");
const result = document.querySelector("#appeal-result");
const count = document.querySelector("#appeal-character-count");
let verified = null;

function signInHref() {
  const returnTo = `${window.location.pathname}${window.location.search}`;
  return `/api/competitions/auth/discord/start?returnTo=${encodeURIComponent(returnTo)}`;
}

function accountName(session) {
  return session.discord?.globalName || session.discord?.username || "your Discord account";
}

function setVerified(binding) {
  verified = binding;
  verifiedRoot.hidden = !binding;
  verifiedRoot.replaceChildren();
  if (binding) {
    const heading = document.createElement("strong");
    heading.textContent = `${binding.punishmentType || "Punishment"} verified`;
    const details = document.createElement("span");
    details.textContent = `Case ${binding.caseId || "available"} · ${binding.boundUsername}`;
    verifiedRoot.append(heading, details);
  }
  submitButton.disabled = !binding || reason.value.trim().length < 10;
}

function claimMessage(payload, status) {
  const codeValue = String(payload?.code || payload?.error || "").toUpperCase();
  if (status === 401) return "Sign in with Discord first.";
  if (codeValue.includes("INVALID") || status === 404) return "That code and username could not be verified.";
  if (codeValue.includes("INELIGIBLE")) return "This punishment is not currently eligible for an appeal.";
  if (codeValue.includes("BOUND") || status === 409) return "That punishment is already connected to another website account.";
  return `The punishment service could not verify this request (${status}).`;
}

async function verifyPunishment() {
  setVerified(null);
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username.value.trim()) || !code.value.trim()) {
    verifyResult.textContent = "Enter the matching Minecraft username and punishment code.";
    return false;
  }
  verifyResult.textContent = "Verifying…";
  verifyButton.disabled = true;
  try {
    const response = await fetch("/api/appeals/claim", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ username: username.value, punishmentCode: code.value })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.eligible !== true) {
      verifyResult.textContent = claimMessage(payload, response.status);
      return false;
    }
    setVerified(payload);
    verifyResult.textContent = "Punishment verified. You can now send your appeal.";
    return true;
  } catch {
    verifyResult.textContent = "Unable to reach the appeal service. Try again in a moment.";
    return false;
  } finally {
    verifyButton.disabled = false;
  }
}

async function loadSession() {
  try {
    const response = await fetch("/api/competitions/auth/session", { credentials: "same-origin", headers: { accept: "application/json" } });
    const session = response.ok ? await response.json() : { authenticated: false };
    authRoot.replaceChildren();
    const copy = document.createElement("div");
    const kicker = document.createElement("p");
    kicker.className = "card-kicker";
    kicker.textContent = "Account";
    const heading = document.createElement("h2");
    const detail = document.createElement("p");
    if (!session.authenticated) {
      heading.textContent = "Sign in with Discord to continue";
      detail.textContent = "Discord secures your website account. You do not have to link a Minecraft account or remain in the Discord to submit an appeal.";
      const link = document.createElement("a");
      link.className = "btn";
      link.href = signInHref();
      link.textContent = "Sign in with Discord";
      copy.append(kicker, heading, detail);
      authRoot.append(copy, link);
      return;
    }
    heading.textContent = `Signed in as ${accountName(session)}`;
    detail.textContent = "Enter the Minecraft username and private code attached to the punishment. Linking accounts is not required.";
    copy.append(kicker, heading, detail);
    authRoot.append(copy);
    fields.disabled = false;
    const linkedName = session.linkedMinecraftAccounts?.[0]?.name;
    if (linkedName && !username.value) username.value = linkedName;
  } catch {
    authRoot.querySelector("h2").textContent = "Unable to check your session";
    authRoot.querySelector("p:last-child").textContent = "Refresh the page before submitting an appeal.";
  }
}

username.addEventListener("input", () => setVerified(null));
code.addEventListener("input", () => setVerified(null));
reason.addEventListener("input", () => {
  count.textContent = String(reason.value.length);
  submitButton.disabled = !verified || reason.value.trim().length < 10;
});
verifyButton.addEventListener("click", verifyPunishment);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  result.textContent = "Sending…";
  submitButton.disabled = true;
  if (!verified && !(await verifyPunishment())) {
    result.textContent = "Verify the punishment before sending your appeal.";
    return;
  }
  try {
    const response = await fetch("/api/appeals", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ username: username.value, punishmentCode: code.value, reason: reason.value })
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      result.textContent = "Your appeal was sent to staff.";
      form.reset();
      count.textContent = "0";
      setVerified(null);
      return;
    }
    result.textContent = payload.error === "rate_limited"
      ? `Too many attempts. Try again in ${payload.retryAfter || "a few"} seconds.`
      : claimMessage(payload, response.status);
  } catch {
    result.textContent = "Unable to reach the appeal service. Try again in a moment.";
  } finally {
    submitButton.disabled = !verified || reason.value.trim().length < 10;
  }
});

loadSession();
