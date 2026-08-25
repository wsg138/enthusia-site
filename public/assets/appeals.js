const authRoot = document.querySelector("#appeal-auth");
const form = document.querySelector("#appeal-form");
const fields = document.querySelector("#appeal-fields");
const username = document.querySelector("#appeal-username");
const code = document.querySelector("#appeal-code");
const verifyButton = document.querySelector("#verify-punishment");
const verifyResult = document.querySelector("#verify-result");
const verifiedRoot = document.querySelector("#verified-punishment");
const submitButton = document.querySelector("#submit-appeal");
const result = document.querySelector("#appeal-result");
const answerFields = [
  { name: "whatHappened", input: document.querySelector("#appeal-what-happened"), count: document.querySelector("#appeal-what-happened-count"), min: 100 },
  { name: "whyReview", input: document.querySelector("#appeal-why-review"), count: document.querySelector("#appeal-why-review-count"), min: 100 },
  { name: "futureSteps", input: document.querySelector("#appeal-future-steps"), count: document.querySelector("#appeal-future-steps-count"), min: 75 },
  { name: "additionalContext", input: document.querySelector("#appeal-additional-context"), count: document.querySelector("#appeal-additional-context-count"), min: 0 }
];
let verified = null;

function signInHref() {
  const returnTo = `${window.location.pathname}${window.location.search}`;
  return `/api/competitions/auth/discord/start?returnTo=${encodeURIComponent(returnTo)}`;
}

function accountName(session) {
  return session.discord?.globalName || session.discord?.username || "your Discord account";
}

function meaningfulLength(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").length;
}

function validateAnswer(field) {
  const length = meaningfulLength(field.input.value);
  field.input.setCustomValidity(field.min > 0 && length < field.min
    ? `Write at least ${field.min} characters in your own words.`
    : "");
  return field.input.validity.valid;
}

function answersValid() {
  return answerFields.every(validateAnswer);
}

function updateSubmitState() {
  submitButton.disabled = !verified || !answersValid();
}

function updateAnswer(field) {
  field.count.textContent = String(field.input.value.length);
  validateAnswer(field);
  updateSubmitState();
}

function setVerified(binding) {
  verified = binding;
  verifiedRoot.hidden = !binding;
  verifiedRoot.replaceChildren();
  if (binding) {
    const heading = document.createElement("strong");
    heading.textContent = `${binding.punishmentType || "Punishment"} confirmed`;
    const details = document.createElement("span");
    details.textContent = `Case ${binding.caseId || "available"} · ${binding.boundUsername}`;
    verifiedRoot.append(heading, details);
  }
  updateSubmitState();
}

function claimMessage(payload, status) {
  const codeValue = String(payload?.code || payload?.error || "").toUpperCase();
  if (status === 401) return "Sign in with Discord first.";
  if (codeValue.includes("INVALID") || status === 404) return "That code and username could not be confirmed.";
  if (codeValue.includes("INELIGIBLE")) return "This punishment is not currently eligible for an appeal.";
  if (codeValue.includes("BOUND") || status === 409) return "That punishment is already connected to another website account.";
  return `The punishment service could not confirm this request (${status}).`;
}

async function verifyPunishment() {
  setVerified(null);
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username.value.trim()) || !code.value.trim()) {
    verifyResult.textContent = "Enter the Minecraft username and private code shown with the punishment.";
    return false;
  }
  verifyResult.textContent = "Checking punishment…";
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
    verifyResult.textContent = "Punishment confirmed. Complete each required answer before sending your appeal.";
    return true;
  } catch {
    verifyResult.textContent = "The appeal service is not responding. Try again in a moment.";
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
    kicker.textContent = "Your account";
    const heading = document.createElement("h2");
    const detail = document.createElement("p");
    if (!session.authenticated) {
      heading.textContent = "Sign in with Discord to continue";
      detail.textContent = "Use the Discord account you use for Enthusia. You do not need to be in the Enthusia Discord to sign in or submit an appeal.";
      const link = document.createElement("a");
      link.className = "btn";
      link.href = signInHref();
      link.textContent = "Sign in with Discord";
      copy.append(kicker, heading, detail);
      authRoot.append(copy, link);
      return;
    }
    heading.textContent = `Signed in as ${accountName(session)}`;
    detail.textContent = "Confirm the punishment below, then complete every required answer before submitting.";
    copy.append(kicker, heading, detail);
    authRoot.append(copy);
    fields.disabled = false;
    const linkedName = session.linkedMinecraftAccounts?.[0]?.name;
    if (linkedName && !username.value) username.value = linkedName;
    updateSubmitState();
  } catch {
    authRoot.querySelector("h2").textContent = "We could not check your session";
    authRoot.querySelector("p:last-child").textContent = "Refresh the page before trying to submit an appeal.";
  }
}

username.addEventListener("input", () => setVerified(null));
code.addEventListener("input", () => setVerified(null));
for (const field of answerFields) field.input.addEventListener("input", () => updateAnswer(field));
verifyButton.addEventListener("click", verifyPunishment);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!answersValid()) {
    result.textContent = "Complete every required answer before sending your appeal.";
    form.reportValidity();
    updateSubmitState();
    return;
  }
  result.textContent = "Sending appeal…";
  submitButton.disabled = true;
  if (!verified && !(await verifyPunishment())) {
    result.textContent = "Confirm the punishment before sending your appeal.";
    return;
  }
  const answers = Object.fromEntries(answerFields.map((field) => [field.name, field.input.value]));
  try {
    const response = await fetch("/api/appeals", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ username: username.value, punishmentCode: code.value, ...answers })
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      result.textContent = "Your appeal was sent to staff.";
      form.reset();
      for (const field of answerFields) updateAnswer(field);
      setVerified(null);
      return;
    }
    if (payload.error === "invalid_appeal") {
      result.textContent = "Complete every required answer with enough detail before submitting.";
    } else if (payload.error === "rate_limited") {
      result.textContent = `Too many attempts. Try again in ${payload.retryAfter || "a few"} seconds.`;
    } else {
      result.textContent = claimMessage(payload, response.status);
    }
  } catch {
    result.textContent = "The appeal service is not responding. Try again in a moment.";
  } finally {
    updateSubmitState();
  }
});

for (const field of answerFields) updateAnswer(field);
loadSession();
