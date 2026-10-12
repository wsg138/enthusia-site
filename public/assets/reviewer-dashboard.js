const authRoot = document.querySelector("#staff-dashboard-auth");
const accessStatus = document.querySelector("#staff-dashboard-access");
const signIn = document.querySelector("#staff-dashboard-sign-in");
const dashboard = document.querySelector("#staff-dashboard");
const refreshButton = document.querySelector("#staff-dashboard-refresh");
const appealWork = document.querySelector("#staff-appeal-work");
const appealOpen = document.querySelector("#staff-appeals-open");
const appealReplied = document.querySelector("#staff-appeals-replied");
const appealWaiting = document.querySelector("#staff-appeals-waiting");
const appealStatus = document.querySelector("#staff-appeal-status");
const competitionWork = document.querySelector("#staff-competition-work");
const competitionState = document.querySelector("#staff-competition-state");
const competitionStatus = document.querySelector("#staff-competition-status");

async function requestJson(path) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function appealsFrom(payload) {
  return Array.isArray(payload?.appeals) ? payload.appeals : [];
}

function playerReplied(appeal) {
  const comments = Array.isArray(appeal?.comments) ? appeal.comments : [];
  return comments.at(-1)?.authorType === "PLAYER";
}

async function loadAppealQueue() {
  appealStatus.textContent = "Loading appeal queue…";
  try {
    const [open, informationRequested] = await Promise.all([
      requestJson("/api/reviewer/appeals?status=OPEN"),
      requestJson("/api/reviewer/appeals?status=INFORMATION_REQUESTED")
    ]);
    if (!open.response.ok || !informationRequested.response.ok) throw new Error("appeal_queue_unavailable");
    const openAppeals = appealsFrom(open.payload);
    const informationAppeals = appealsFrom(informationRequested.payload);
    const replies = informationAppeals.filter(playerReplied).length;
    appealOpen.textContent = String(openAppeals.length);
    appealReplied.textContent = String(replies);
    appealWaiting.textContent = String(informationAppeals.length - replies);
    const limited = Boolean(open.payload.nextCursor || informationRequested.payload.nextCursor);
    appealStatus.textContent = limited
      ? "Counts show the first 50 appeals in each queue. Open the queue to continue."
      : "Appeal queue is up to date.";
  } catch {
    appealOpen.textContent = "—";
    appealReplied.textContent = "—";
    appealWaiting.textContent = "—";
    appealStatus.textContent = "The appeal queue could not be loaded. Refresh to try again.";
  }
}

async function loadCompetitionStatus() {
  competitionState.textContent = "Checking competition services…";
  competitionStatus.textContent = "";
  try {
    const { response, payload } = await requestJson("/api/competitions/admin/status");
    if (![200, 503].includes(response.status) || typeof payload.ok !== "boolean") {
      throw new Error("competition_status_unavailable");
    }
    competitionState.textContent = payload.ok
      ? "Competition services are ready."
      : "Competition setup still needs attention before an event can go live.";
    competitionState.classList.toggle("is-ready", payload.ok);
    competitionState.classList.toggle("needs-attention", !payload.ok);
    competitionStatus.textContent = payload.ok
      ? "Open the competition tools to manage entries, judging, and results."
      : "Open the competition tools to see the current development status.";
  } catch {
    competitionState.textContent = "Competition status is unavailable.";
    competitionState.classList.remove("is-ready", "needs-attention");
    competitionStatus.textContent = "Refresh to try again.";
  }
}

async function loadDashboard() {
  refreshButton.disabled = true;
  accessStatus.textContent = "Checking staff access…";
  signIn.hidden = true;
  try {
    const { response, payload } = await requestJson("/api/reviewer/session");
    if (response.status === 401) {
      dashboard.hidden = true;
      authRoot.hidden = false;
      accessStatus.textContent = "Sign in with Discord to open the staff dashboard.";
      signIn.href = "/api/competitions/auth/discord/start?returnTo=%2Freviewer%2F";
      signIn.hidden = false;
      return;
    }
    if (!response.ok) throw new Error("staff_access_unavailable");
    const appeals = payload.appeals === true;
    const competitions = payload.competitions === true;
    if (!appeals && !competitions) {
      dashboard.hidden = true;
      authRoot.hidden = false;
      accessStatus.textContent = "This account does not have access to staff website tools.";
      return;
    }
    authRoot.hidden = true;
    dashboard.hidden = false;
    appealWork.hidden = !appeals;
    competitionWork.hidden = !competitions;
    const jobs = [];
    if (appeals) jobs.push(loadAppealQueue());
    if (competitions) jobs.push(loadCompetitionStatus());
    await Promise.allSettled(jobs);
  } catch {
    dashboard.hidden = true;
    authRoot.hidden = false;
    accessStatus.textContent = "Staff access could not be checked. Refresh the page to try again.";
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", loadDashboard);
loadDashboard();
