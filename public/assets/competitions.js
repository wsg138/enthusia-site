const API_ROOT = "/api/competitions";

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatDate(value) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function stateLabel(state) {
  return ({
    UPCOMING: "Upcoming",
    SUBMISSIONS_OPEN: "Submissions open",
    REVIEW: "Staff review",
    VOTING: "Voting open",
    JUDGING: "Judging",
    RESULTS_READY: "Results pending publication",
    COMPLETED: "Completed",
    ARCHIVED: "Archived"
  })[state] ?? state;
}

function detailHref(slug) {
  return `detail.html?competition=${encodeURIComponent(slug)}`;
}

function accent(competition) {
  return competition.config?.appearance?.accent || "#ff8a00";
}

function competitionCard(competition) {
  const article = document.createElement("article");
  article.className = "competition-card";
  article.style.setProperty("--competition-accent", accent(competition));

  const meta = document.createElement("div");
  meta.className = "competition-card-meta";
  for (const label of [stateLabel(competition.lifecycleState), competition.category]) {
    const badge = document.createElement("span");
    badge.className = "competition-badge";
    badge.textContent = label;
    meta.append(badge);
  }

  const heading = document.createElement("h3");
  heading.textContent = competition.title;
  const summary = document.createElement("p");
  summary.textContent = text(competition.config?.public?.summary, "Open the competition for details.");
  const link = document.createElement("a");
  link.className = "competition-card-link";
  link.href = detailHref(competition.slug);
  link.textContent = competition.lifecycleState === "COMPLETED" || competition.lifecycleState === "ARCHIVED"
    ? "View results"
    : "View competition";

  article.append(meta, heading, summary, link);
  return article;
}

function primaryCompetition(competitions) {
  const priorities = new Map([
    ["SUBMISSIONS_OPEN", 1],
    ["VOTING", 2],
    ["JUDGING", 3],
    ["REVIEW", 4],
    ["RESULTS_READY", 5],
    ["UPCOMING", 6]
  ]);
  return competitions
    .filter((competition) => priorities.has(competition.lifecycleState))
    .sort((a, b) => priorities.get(a.lifecycleState) - priorities.get(b.lifecycleState))[0] ?? null;
}

function renderFeatured(root, competition) {
  if (!competition) {
    const empty = document.createElement("div");
    empty.className = "competition-empty";
    empty.textContent = "There is no active competition right now. Check upcoming competitions below.";
    root.replaceChildren(empty);
    return;
  }

  const feature = document.createElement("article");
  feature.className = "competition-featured";
  feature.style.setProperty("--competition-accent", accent(competition));

  const copy = document.createElement("div");
  copy.className = "competition-featured-copy";
  const kicker = document.createElement("p");
  kicker.className = "competitions-kicker";
  kicker.textContent = stateLabel(competition.lifecycleState);
  const heading = document.createElement("h2");
  heading.textContent = competition.title;
  const summary = document.createElement("p");
  summary.textContent = text(competition.config?.public?.summary, "Open the competition for full details.");
  const link = document.createElement("a");
  link.className = "competition-primary-action";
  link.href = detailHref(competition.slug);
  link.textContent = "Open competition";
  copy.append(kicker, heading, summary, link);

  const side = document.createElement("div");
  side.className = "competition-featured-side";
  const schedule = competition.config?.schedule ?? {};
  const rows = [
    ["Category", competition.category],
    ["Submissions close", formatDate(schedule.submissionsCloseAt)],
    ["Voting closes", competition.config?.voting?.enabled ? formatDate(schedule.votingCloseAt) : "No community vote"]
  ];
  for (const [label, value] of rows) {
    const item = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = value;
    const span = document.createElement("span");
    span.textContent = label;
    item.append(strong, span);
    side.append(item);
  }

  feature.append(copy, side);
  root.replaceChildren(feature);
}

function renderGrid(root, competitions, emptyMessage) {
  if (!competitions.length) {
    const empty = document.createElement("div");
    empty.className = "competition-empty";
    empty.textContent = emptyMessage;
    root.replaceChildren(empty);
    return;
  }
  root.replaceChildren(...competitions.map(competitionCard));
}

async function loadCatalog() {
  const featured = document.querySelector("#featuredCompetition");
  const upcoming = document.querySelector("#upcomingCompetitions");
  const history = document.querySelector("#competitionHistory");
  try {
    const response = await fetch(API_ROOT, { headers: { accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    const competitions = Array.isArray(payload.competitions) ? payload.competitions : [];
    const primary = primaryCompetition(competitions);
    renderFeatured(featured, primary);
    renderGrid(
      upcoming,
      competitions.filter((competition) => competition.lifecycleState === "UPCOMING" && competition.id !== primary?.id),
      "No additional competitions are currently scheduled."
    );
    renderGrid(
      history,
      competitions.filter((competition) => ["COMPLETED", "ARCHIVED"].includes(competition.lifecycleState)),
      "Completed competition history will appear here permanently."
    );
  } catch {
    const error = document.createElement("div");
    error.className = "competition-error";
    error.textContent = "Competitions are temporarily unavailable.";
    featured.replaceChildren(error);
    upcoming.replaceChildren();
    history.replaceChildren();
  }
}

function infoItem(label, value) {
  const item = document.createElement("div");
  item.className = "competition-info-item";
  const strong = document.createElement("strong");
  strong.textContent = value;
  const span = document.createElement("span");
  span.textContent = label;
  item.append(strong, span);
  return item;
}

function renderOverview(root, competition) {
  const config = competition.config ?? {};
  const schedule = config.schedule ?? {};
  const section = document.createElement("section");
  section.className = "competition-tab-panel";
  section.dataset.tabPanel = "overview";

  const description = document.createElement("div");
  description.className = "competition-copy";
  description.textContent = text(config.public?.description, config.public?.summary || "No description has been published yet.");

  const info = document.createElement("div");
  info.className = "competition-info-grid";
  info.append(
    infoItem("Submissions open", formatDate(schedule.submissionsOpenAt)),
    infoItem("Submissions close", formatDate(schedule.submissionsCloseAt)),
    infoItem("Review ends", formatDate(schedule.reviewCloseAt)),
    infoItem("Max entries per player", String(config.entries?.maxEntriesPerPlayer ?? "—")),
    infoItem("Images per entry", `Up to ${config.entries?.maxImages ?? "—"}`),
    infoItem("Entry types", (config.entries?.allowedTypes ?? []).join(", ") || "—")
  );

  section.append(description, info);

  if (config.entries?.coordinatesRequested && config.entries?.judgesCanViewCoordinates) {
    const warning = document.createElement("div");
    warning.className = "competition-private-warning";
    warning.textContent = "This competition requests private build coordinates. Assigned judges will be allowed to see those coordinates for judging.";
    section.append(warning);
  }

  const rulesHeading = document.createElement("h2");
  rulesHeading.textContent = "Rules";
  const rules = document.createElement("div");
  rules.className = "competition-copy";
  rules.textContent = text(config.public?.rules, "No additional rules have been published.");
  section.append(rulesHeading, rules);
  root.append(section);
}

function participantLabel(participant) {
  const role = ({ OWNER: "Owner", MAIN: "Main", HELPER: "Helper", GUILD_WORKER: "Guild worker" })[participant.role] ?? participant.role;
  return `${participant.playerName} · ${role}`;
}

function renderEntries(root, payload) {
  const section = document.createElement("section");
  section.className = "competition-tab-panel";
  section.dataset.tabPanel = "entries";
  section.hidden = true;

  if (!payload.entriesVisible) {
    const notice = document.createElement("div");
    notice.className = "competition-empty";
    notice.textContent = "Entries stay hidden while submissions and staff review are in progress. They will appear when the public viewing/voting stage begins.";
    section.append(notice);
    root.append(section);
    return;
  }

  const submissions = Array.isArray(payload.submissions) ? payload.submissions : [];
  if (!submissions.length) {
    const empty = document.createElement("div");
    empty.className = "competition-empty";
    empty.textContent = "No approved entries are available yet.";
    section.append(empty);
    root.append(section);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "submission-grid";
  for (const submission of submissions) {
    const card = document.createElement("article");
    card.className = "submission-card";
    const type = document.createElement("span");
    type.className = "competition-badge";
    type.textContent = submission.entryType;
    const heading = document.createElement("h3");
    heading.textContent = submission.title;
    const owner = document.createElement("p");
    owner.textContent = submission.entryType === "GUILD" && submission.guildName
      ? `${submission.guildName} · submitted by ${submission.ownerName}`
      : `By ${submission.ownerName}`;
    const description = document.createElement("p");
    description.textContent = submission.description;
    const members = document.createElement("div");
    members.className = "submission-members";
    for (const participant of submission.participants ?? []) {
      const member = document.createElement("span");
      member.className = "submission-member";
      member.textContent = participantLabel(participant);
      members.append(member);
    }
    card.append(type, heading, owner, description);
    if (members.children.length) card.append(members);
    if (submission.staffEdited) {
      const edited = document.createElement("span");
      edited.className = "staff-edited-label";
      edited.textContent = "Edited by staff";
      card.append(edited);
    }
    grid.append(card);
  }
  section.append(grid);
  root.append(section);
}

function renderPlaceholderPanel(root, name, message) {
  const section = document.createElement("section");
  section.className = "competition-tab-panel";
  section.dataset.tabPanel = name;
  section.hidden = true;
  const notice = document.createElement("div");
  notice.className = "competition-empty";
  notice.textContent = message;
  section.append(notice);
  root.append(section);
}

function setupTabs(buttons, panels) {
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const name = button.dataset.tab;
      buttons.forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
      panels.forEach((panel) => { panel.hidden = panel.dataset.tabPanel !== name; });
    });
  });
}

async function loadDetail() {
  const root = document.querySelector("#competitionDetail");
  const slug = new URLSearchParams(window.location.search).get("competition")?.trim().toLowerCase();
  if (!slug) {
    root.innerHTML = '<div class="competition-error">No competition was selected.</div>';
    return;
  }

  try {
    const response = await fetch(`${API_ROOT}/${encodeURIComponent(slug)}`, { headers: { accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    const competition = payload.competition;
    document.title = `${competition.title} | Enthusia Competitions`;

    const shell = document.createElement("article");
    shell.className = "competition-detail-shell";
    const hero = document.createElement("header");
    hero.className = "competition-detail-hero";
    hero.style.setProperty("--competition-accent", accent(competition));
    const kicker = document.createElement("p");
    kicker.className = "competitions-kicker";
    kicker.textContent = `${stateLabel(competition.lifecycleState)} · ${competition.category}`;
    const heading = document.createElement("h1");
    heading.textContent = competition.title;
    const summary = document.createElement("p");
    summary.textContent = text(competition.config?.public?.summary, "Competition details");
    hero.append(kicker, heading, summary);

    const tabs = document.createElement("nav");
    tabs.className = "competition-detail-tabs";
    tabs.setAttribute("aria-label", "Competition sections");
    const tabDefinitions = [
      ["overview", "Overview"],
      ["entries", "Entries"],
      ["vote", "Vote"],
      ["results", "Results"]
    ];
    const buttons = tabDefinitions.map(([name, label], index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.tab = name;
      button.textContent = label;
      if (index === 0) button.classList.add("is-active");
      tabs.append(button);
      return button;
    });

    const content = document.createElement("div");
    content.className = "competition-detail-content";
    renderOverview(content, competition);
    renderEntries(content, payload);
    renderPlaceholderPanel(content, "vote", competition.config?.voting?.enabled
      ? "Voting controls will appear here when the authenticated voting flow is enabled."
      : "This competition does not use community voting.");
    renderPlaceholderPanel(content, "results", ["COMPLETED", "ARCHIVED"].includes(competition.lifecycleState)
      ? "Published placements will appear here after the results pipeline is connected."
      : "Results have not been published yet.");

    shell.append(hero, tabs, content);
    root.replaceChildren(shell);
    setupTabs(buttons, [...content.querySelectorAll("[data-tab-panel]")]);
  } catch {
    const error = document.createElement("div");
    error.className = "competition-error";
    error.textContent = "This competition could not be loaded.";
    root.replaceChildren(error);
  }
}

const mode = document.body.dataset.competitionPage;
if (mode === "catalog") loadCatalog();
if (mode === "detail") loadDetail();
