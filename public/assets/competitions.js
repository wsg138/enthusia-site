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

const STAGE_COPY = Object.freeze({
  UPCOMING: ["Getting ready", "Read the brief and plan your entry before submissions open."],
  SUBMISSIONS_OPEN: ["Submissions open", "Create an entry, add your screenshots, and send it to staff for review."],
  REVIEW: ["Entry review", "Staff checks each entry. Entrants can make any requested fixes."],
  VOTING: ["Community voting", "Eligible players can vote for their favorite approved entries."],
  JUDGING: ["Judging", "Assigned judges score approved entries using the published criteria."],
  RESULTS_READY: ["Final checks", "Staff is resolving the final standings before results are published."],
  COMPLETED: ["Results published", "Placements are final and the approved entries remain available here."],
  ARCHIVED: ["Archived", "This competition and its results are preserved in the archive."]
});

function stageSchedule(competition) {
  const schedule = competition.config?.schedule ?? {};
  const voting = Boolean(competition.config?.voting?.enabled);
  const judging = Boolean(competition.config?.judging?.enabled);
  return [
    { state: "UPCOMING", label: "Getting ready", start: null, end: schedule.submissionsOpenAt },
    { state: "SUBMISSIONS_OPEN", label: "Submissions", start: schedule.submissionsOpenAt, end: schedule.submissionsCloseAt },
    { state: "REVIEW", label: "Entry review", start: schedule.submissionsCloseAt, end: voting ? schedule.votingOpenAt : judging ? schedule.judgingOpenAt : schedule.reviewCloseAt },
    ...(voting ? [{ state: "VOTING", label: "Community voting", start: schedule.votingOpenAt, end: schedule.votingCloseAt }] : []),
    ...(judging ? [{ state: "JUDGING", label: "Judging", start: schedule.judgingOpenAt, end: schedule.judgingCloseAt }] : []),
    { state: "RESULTS_READY", label: "Final checks", start: judging ? schedule.judgingCloseAt : voting ? schedule.votingCloseAt : schedule.reviewCloseAt, end: null },
    { state: "COMPLETED", label: "Results published", start: null, end: null }
  ];
}

function nextStage(competition) {
  const stages = stageSchedule(competition);
  const index = stages.findIndex((stage) => stage.state === competition.lifecycleState);
  const current = stages[index] ?? { state: competition.lifecycleState, label: stateLabel(competition.lifecycleState), end: null };
  const next = index >= 0 ? stages[index + 1] ?? null : null;
  return { current, next, target: current.end };
}

function countdownText(value, now = Date.now()) {
  const target = Date.parse(value ?? "");
  if (!Number.isFinite(target)) return null;
  const seconds = Math.max(0, Math.floor((target - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [days ? `${days}d` : null, `${String(hours).padStart(2, "0")}h`, `${String(minutes).padStart(2, "0")}m`, `${String(remainder).padStart(2, "0")}s`].filter(Boolean).join(" ");
}

function stageDescription(state) {
  return STAGE_COPY[state]?.[1] ?? "Follow this competition here as it moves through each round.";
}

function renderStagePanel(competition, { includeSchedule = true } = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "competition-stage-block";
  const panel = document.createElement("section");
  panel.className = "competition-stage-panel";
  const { current, next, target } = nextStage(competition);
  const copy = document.createElement("div");
  copy.className = "competition-stage-copy";
  const eyebrow = document.createElement("span");
  eyebrow.className = "competition-stage-label";
  eyebrow.textContent = "Current stage";
  const title = document.createElement("strong");
  title.textContent = STAGE_COPY[competition.lifecycleState]?.[0] ?? current.label;
  const description = document.createElement("p");
  description.textContent = stageDescription(competition.lifecycleState);
  copy.append(eyebrow, title, description);
  const countdown = document.createElement("div");
  countdown.className = "competition-countdown";
  const value = document.createElement("strong");
  const caption = document.createElement("span");
  const update = () => {
    const remaining = countdownText(target);
    value.textContent = remaining ?? (next ? "Date pending" : "Complete");
    caption.textContent = next ? `until ${next.label.toLowerCase()}` : "No further stages";
  };
  update();
  if (target) window.setInterval(update, 1000);
  countdown.append(value, caption);
  panel.append(copy, countdown);
  wrapper.append(panel);

  if (includeSchedule) {
    const details = document.createElement("details");
    details.className = "competition-schedule-disclosure";
    const summary = document.createElement("summary");
    summary.textContent = "See every stage and date";
    const list = document.createElement("ol");
    list.className = "competition-stage-list";
    for (const stage of stageSchedule(competition)) {
      const item = document.createElement("li");
      item.className = `competition-stage-row${stage.state === competition.lifecycleState ? " is-current" : ""}`;
      const dot = document.createElement("span");
      dot.className = "competition-stage-dot";
      const stageCopy = document.createElement("div");
      const heading = document.createElement("strong");
      heading.textContent = stage.label;
      const explanation = document.createElement("p");
      explanation.textContent = stageDescription(stage.state);
      stageCopy.append(heading, explanation);
      const time = document.createElement("span");
      time.className = "competition-stage-time";
      time.textContent = stage.start && stage.end ? `${formatDate(stage.start)} – ${formatDate(stage.end)}` : stage.end ? `Until ${formatDate(stage.end)}` : stage.start ? `After ${formatDate(stage.start)}` : "Published by staff";
      item.append(dot, stageCopy, time);
      list.append(item);
    }
    details.append(summary, list);
    wrapper.append(details);
  }
  return wrapper;
}

function detailHref(slug) {
  return `detail.html?competition=${encodeURIComponent(slug)}`;
}

function accent(competition) {
  return competition.config?.appearance?.accent || "#ff8a00";
}

function bannerMediaId(competition) {
  const value = competition.config?.appearance?.bannerImageId;
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value.toLowerCase() : null;
}

function bannerMediaUrl(competition) {
  const id = bannerMediaId(competition);
  return id ? `${API_ROOT}/media/${encodeURIComponent(id)}` : null;
}

function bannerImage(competition, className, alt = "") {
  const url = bannerMediaUrl(competition) ?? "../assets/screenshots/slide-01.webp";
  const image = document.createElement("img");
  image.className = className;
  image.src = url;
  image.alt = alt;
  image.loading = "lazy";
  image.decoding = "async";
  image.referrerPolicy = "same-origin";
  image.addEventListener("error", () => { image.src = "../assets/enthusia-logo-v2.png"; }, { once: true });
  return image;
}

function competitionCard(competition) {
  const article = document.createElement("article");
  article.className = "competition-card";
  article.style.setProperty("--competition-accent", accent(competition));

  const image = bannerImage(competition, "competition-card-banner", "");
  const body = document.createElement("div");
  body.className = "competition-card-body";

  const meta = document.createElement("span");
  meta.className = "competition-card-context";
  meta.textContent = competition.category;

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

  body.append(meta, heading, summary, link);
  if (image) article.append(image);
  article.append(body);
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
  const media = bannerImage(competition, "competition-featured-banner", "");
  if (media) feature.classList.add("has-banner");

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

  if (media) feature.append(media);
  feature.append(copy, renderStagePanel(competition, { includeSchedule: false }));
  root.classList.remove("competition-loading");
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
    const response = await fetch(API_ROOT, {
      credentials: "same-origin",
      headers: { accept: "application/json" }
    });
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

function placementLabel(value) {
  const placement = Number(value);
  if (!Number.isInteger(placement) || placement < 1) return "Placement";
  const mod100 = placement % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${placement}th place`;
  return `${placement}${({ 1: "st", 2: "nd", 3: "rd" })[placement % 10] ?? "th"} place`;
}

function renderRewards(section, competition) {
  const definitions = Array.isArray(competition.config?.rewards?.definitions)
    ? competition.config.rewards.definitions
    : [];
  if (!definitions.length) return;

  const heading = document.createElement("h2");
  heading.textContent = "Rewards";
  const grid = document.createElement("div");
  grid.className = "competition-reward-grid";

  for (const reward of definitions) {
    const card = document.createElement("article");
    card.className = "competition-reward-card";
    const place = document.createElement("span");
    place.className = "competition-reward-placement";
    place.textContent = placementLabel(reward.placement);
    const title = document.createElement("strong");
    title.textContent = reward.publicLabel;
    const description = document.createElement("p");
    description.textContent = reward.publicDescription;
    card.append(place, title, description);
    grid.append(card);
  }

  const helperMultiplier = competition.config?.rewards?.helperRewardMultiplier;
  const note = document.createElement("p");
  note.className = "competition-reward-note";
  note.textContent = typeof helperMultiplier === "number" && helperMultiplier !== 1
    ? `Helpers are reward-eligible at ${Math.round(helperMultiplier * 100)}% of the normal participant share when the reward supports proportional distribution.`
    : "Reward distribution follows the rules shown for each competition.";

  section.append(heading, grid, note);
}

function renderOverview(root, payload) {
  const competition = payload.competition;
  const config = competition.config ?? {};
  const schedule = config.schedule ?? {};
  const section = document.createElement("section");
  section.className = "competition-tab-panel";
  section.dataset.tabPanel = "overview";

  section.append(renderStagePanel(competition));

  if (["COMPLETED", "ARCHIVED"].includes(competition.lifecycleState) && payload.results?.length) {
    const winnerResult = payload.results.find((result) => result.placement === 1) ?? payload.results[0];
    const winnerEntry = payload.submissions?.find((entry) => entry.id === winnerResult.submissionId);
    const summary = document.createElement("section");
    summary.className = "competition-completed-summary";
    const dates = document.createElement("div");
    dates.className = "competition-completed-dates";
    dates.innerHTML = `<span><strong>Started</strong> ${formatDate(competition.config?.schedule?.submissionsOpenAt)}</span><span><strong>Ended</strong> ${formatDate(winnerResult.publishedAt)}</span>`;
    const winner = document.createElement("div");
    winner.className = "competition-winner";
    const image = document.createElement("img");
    image.src = winnerEntry?.coverImageUrl || "../assets/screenshots/slide-01.webp";
    image.alt = winnerEntry?.coverImageUrl ? `${winnerEntry.title} cover image` : "Placeholder winning entry image";
    winner.append(image);
    const copy = document.createElement("div"); copy.className = "competition-winner-copy";
    const intro = document.createElement("div"); intro.className = "competition-winner-intro";
    const eyebrow = document.createElement("p"); eyebrow.className = "competitions-kicker"; eyebrow.textContent = "Winner";
    const heading = document.createElement("h2"); heading.textContent = winnerResult.title;
    intro.append(eyebrow, heading);
    const teamLabel = document.createElement("strong"); teamLabel.className = "competition-winner-team-label"; teamLabel.textContent = "Winning team";
    const playerNames = participantNames(winnerEntry);
    const members = document.createElement("div"); members.className = "competition-winner-members"; members.dataset.count = String(playerNames.length); members.style.setProperty("--winner-columns", String(Math.min(3, Math.max(1, playerNames.length))));
    for (const playerName of playerNames) { const member = document.createElement("div"); member.className = "competition-winner-member"; const skin = document.createElement("img"); skin.src = `https://mc-heads.net/body/${encodeURIComponent(playerName)}/180`; skin.alt = `${playerName} Minecraft skin`; skin.addEventListener("error", () => { skin.src = `https://mc-heads.net/avatar/${encodeURIComponent(playerName)}/96`; }, { once: true }); const name = document.createElement("strong"); name.textContent = playerName; member.append(skin, name); members.append(member); }
    intro.append(teamLabel); copy.append(intro);
    const view = document.createElement("button"); view.type = "button"; view.className = "competition-primary-action"; view.textContent = "View winning entry"; view.addEventListener("click", () => showEntryDialog(payload.submissions, winnerEntry?.id)); copy.append(view);
    if (members.children.length) winner.append(members); winner.append(copy); summary.append(winner); section.append(dates, summary);
  }

  const description = document.createElement("div");
  description.className = "competition-copy";
  description.textContent = text(config.public?.description, config.public?.summary || "No description has been published yet.");

  const glance = document.createElement("div");
  glance.className = "competition-overview-glance";
  const facts = [
    ["Entries open", formatDate(schedule.submissionsOpenAt)],
    ["Entries close", formatDate(schedule.submissionsCloseAt)],
    ["Entry types", (config.entries?.allowedTypes ?? []).map((type) => type.toLowerCase()).join(", ") || "To be announced"]
  ];
  for (const [label, value] of facts) { const fact = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = label; const span = document.createElement("span"); span.textContent = value; fact.append(strong, span); glance.append(fact); }
  section.append(description, glance);
  root.append(section);
}

function participantLabel(participant) {
  const role = ({ OWNER: "Owner", MAIN: "Main", HELPER: "Helper", GUILD_WORKER: "Guild worker" })[participant.role] ?? participant.role;
  return `${participant.playerName} · ${role}`;
}

function participantNames(entry) {
  const names = [...new Set((entry?.participants ?? []).map((participant) => participant.playerName).filter(Boolean))];
  if (!names.length && entry?.ownerName) names.push(entry.ownerName);
  return names;
}

function openImageLightbox(images, selectedIndex, title) {
  let imageIndex = selectedIndex;
  const dialog = document.createElement("dialog");
  dialog.className = "competition-image-lightbox";
  const frame = document.createElement("div");
  frame.className = "competition-image-lightbox-frame";
  const render = () => {
    const image = document.createElement("img");
    image.src = images[imageIndex].url;
    image.alt = `${title}, image ${imageIndex + 1} of ${images.length}`;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "competition-image-lightbox-close";
    close.setAttribute("aria-label", "Close enlarged image");
    close.textContent = "×";
    close.addEventListener("click", () => dialog.close());
    const controls = document.createElement("div");
    controls.className = "competition-image-lightbox-controls";
    const previous = document.createElement("button");
    previous.type = "button";
    previous.className = "competition-back-link";
    previous.textContent = "← Previous";
    previous.disabled = imageIndex === 0;
    previous.addEventListener("click", () => { imageIndex -= 1; render(); });
    const count = document.createElement("span");
    count.textContent = `${imageIndex + 1} of ${images.length}`;
    const next = document.createElement("button");
    next.type = "button";
    next.className = "competition-back-link";
    next.textContent = "Next →";
    next.disabled = imageIndex === images.length - 1;
    next.addEventListener("click", () => { imageIndex += 1; render(); });
    controls.append(previous, count, next);
    frame.replaceChildren(close, image, controls);
  };
  dialog.append(frame);
  document.body.append(dialog);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  render();
  dialog.showModal();
}

function showEntryDialog(submissions, selectedId) {
  const entries = Array.isArray(submissions) ? submissions : [];
  let entryIndex = Math.max(0, entries.findIndex((entry) => entry.id === selectedId));
  const dialog = document.createElement("dialog");
  dialog.className = "competition-entry-dialog";
  const view = document.createElement("div"); view.className = "competition-entry-view";
  const close = document.createElement("button"); close.type = "button"; close.className = "competition-entry-dialog-close"; close.setAttribute("aria-label", "Close entry"); close.textContent = "×"; close.addEventListener("click", () => dialog.close());
  const render = () => {
    const entry = entries[entryIndex]; if (!entry) { dialog.close(); return; }
    const header = document.createElement("header");
    const type = document.createElement("p"); type.className = "competitions-kicker"; type.textContent = entry.entryType;
    const heading = document.createElement("h2"); heading.textContent = entry.title;
    const description = document.createElement("p"); description.textContent = entry.description;
    header.append(type, heading, description);
    const members = document.createElement("div"); members.className = "competition-entry-members";
    for (const participant of entry.participants ?? []) { const item = document.createElement("div"); item.className = "competition-entry-member"; const head = document.createElement("img"); head.src = `https://mc-heads.net/avatar/${encodeURIComponent(participant.playerName)}/64`; head.alt = `${participant.playerName} Minecraft head`; const details = document.createElement("span"); const name = document.createElement("strong"); name.textContent = participant.playerName; const role = document.createElement("small"); role.textContent = participantLabel(participant).split(" · ").at(-1); details.append(name, role); item.append(head, details); members.append(item); }
    const media = document.createElement("div"); media.className = "competition-entry-gallery";
    const images = entry.images ?? [];
    images.forEach((item, index) => { const button = document.createElement("button"); button.type = "button"; button.setAttribute("aria-label", `Enlarge image ${index + 1}`); const image = document.createElement("img"); image.src = item.url; image.alt = `${entry.title}, image ${index + 1} of ${images.length}`; button.append(image); button.addEventListener("click", () => openImageLightbox(images, index, entry.title)); media.append(button); });
    const recordNav = document.createElement("div"); recordNav.className = "competition-entry-record-nav";
    const previousEntry = document.createElement("button"); previousEntry.className = "competition-back-link"; previousEntry.textContent = "← Previous entry"; previousEntry.disabled = entryIndex === 0; previousEntry.addEventListener("click", () => { entryIndex--; render(); });
    const nextEntry = document.createElement("button"); nextEntry.className = "competition-back-link"; nextEntry.textContent = "Next entry →"; nextEntry.disabled = entryIndex === entries.length - 1; nextEntry.addEventListener("click", () => { entryIndex++; render(); }); recordNav.append(previousEntry, nextEntry);
    view.replaceChildren(close, header); if (members.children.length) view.append(members); view.append(media, recordNav);
  };
  dialog.append(view); document.body.append(dialog); dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }); dialog.addEventListener("close", () => dialog.remove(), { once: true }); render(); dialog.showModal();
}

function warmEntryImages(entry, limit = 3) {
  for (const item of (entry?.images ?? []).slice(0, limit)) {
    if (!item?.url) continue;
    const image = new Image();
    image.decoding = "async";
    image.src = item.url;
  }
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

  const completed = ["COMPLETED", "ARCHIVED"].includes(payload.competition.lifecycleState);
  const placements = new Map((payload.results ?? []).map((result) => [result.submissionId, result.placement]));
  const grid = document.createElement("div");
  grid.className = "submission-grid";
  const orderedSubmissions = [...submissions].sort((a, b) => (placements.get(a.id) ?? 999) - (placements.get(b.id) ?? 999));
  for (const submission of orderedSubmissions) {
    const card = document.createElement("article");
    card.className = "submission-card is-clickable";
    const placement = completed ? placements.get(submission.id) : null;
    if (placement && placement <= 3) card.classList.add("is-podium", `is-place-${placement}`);
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    const preview = document.createElement("img");
    preview.className = "submission-card-cover";
    preview.src = submission.coverImageUrl || "../assets/screenshots/slide-01.webp";
    preview.alt = submission.coverImageUrl ? `${submission.title} cover image` : "Placeholder competition entry image";
    const type = document.createElement("span");
    type.className = "competition-badge";
    type.textContent = submission.entryType;
    const heading = document.createElement("h3");
    heading.textContent = submission.title;
    const names = document.createElement("p");
    names.className = "submission-player-names";
    names.textContent = participantNames(submission).join(" · ");
    const description = document.createElement("p");
    description.textContent = submission.description;
    card.append(preview, type, heading, names, description);
    if (placement && placement <= 3) { const place = document.createElement("span"); place.className = "submission-podium-mark"; place.textContent = placementLabel(placement); card.append(place); }
    if (submission.staffEdited) {
      const edited = document.createElement("span");
      edited.className = "staff-edited-label";
      edited.textContent = "Edited by staff";
      card.append(edited);
    }
    card.addEventListener("click", (event) => { if (!event.target.closest("button,a")) showEntryDialog(submissions, submission.id); });
    card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); showEntryDialog(submissions, submission.id); } });
    card.addEventListener("pointerenter", () => warmEntryImages(submission), { once: true });
    card.addEventListener("focus", () => warmEntryImages(submission), { once: true });
    card.addEventListener("pointerdown", () => warmEntryImages(submission), { once: true });
    grid.append(card);
  }
  section.append(grid);
  root.append(section);
}

function scoreBreakdown(result, competition) {
  const scores = [["Final", result.finalScore]];
  if (competition.config?.voting?.enabled && result.communityComponent != null) scores.push(["Community", result.communityComponent]);
  if (competition.config?.judging?.enabled && result.judgeComponent != null) scores.push(["Judges", result.judgeComponent]);
  const list = document.createElement("div"); list.className = "competition-score-breakdown";
  for (const [label, value] of scores) { const item = document.createElement("span"); const name = document.createElement("small"); name.textContent = label; const number = document.createElement("strong"); number.textContent = Number(value).toFixed(2); item.append(name, number); list.append(item); }
  return list;
}

function resultName(result) {
  return result.entryType === "GUILD" && result.guildName
    ? result.guildName
    : result.ownerName;
}

function resultCard(result, submissions, competition, podium = false) {
  const entry = submissions?.find((submission) => submission.id === result.submissionId);
  const card = document.createElement("article");
  card.className = `${podium ? "competition-podium-card" : "competition-result-row"} is-clickable`;
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.dataset.placement = String(result.placement);

  const place = document.createElement("strong");
  place.className = "competition-result-place";
  place.textContent = placementLabel(result.placement);
  const playerName = entry?.participants?.[0]?.playerName || result.ownerName;
  const playerVisual = document.createElement("img");
  playerVisual.className = podium ? "competition-result-skin" : "competition-result-head";
  playerVisual.src = podium ? `https://mc-heads.net/body/${encodeURIComponent(playerName)}/180` : `https://mc-heads.net/avatar/${encodeURIComponent(playerName)}/64`;
  playerVisual.alt = `${playerName} Minecraft ${podium ? "skin" : "head"}`;
  const copy = document.createElement("div");
  const heading = document.createElement("h3");
  heading.textContent = result.title;
  const players = document.createElement("p"); players.className = "competition-result-players"; players.textContent = participantNames(entry).join(" · ");
  const score = scoreBreakdown(result, competition);
  copy.append(heading, players);
  card.append(place, playerVisual, copy, score);
  if (result.staffEdited) {
    const edited = document.createElement("span");
    edited.className = "staff-edited-label";
    edited.textContent = "Edited by staff";
    card.append(edited);
  }
  card.addEventListener("click", (event) => { if (!event.target.closest("button,a")) showEntryDialog(submissions, result.submissionId); });
  card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); showEntryDialog(submissions, result.submissionId); } });
  card.addEventListener("pointerenter", () => warmEntryImages(entry), { once: true });
  card.addEventListener("focus", () => warmEntryImages(entry), { once: true });
  card.addEventListener("pointerdown", () => warmEntryImages(entry), { once: true });
  return card;
}

function renderResults(root, payload) {
  const section = document.createElement("section");
  section.className = "competition-tab-panel";
  section.dataset.tabPanel = "results";
  section.hidden = true;

  const results = Array.isArray(payload.results) ? payload.results : [];
  if (!results.length) {
    const notice = document.createElement("div");
    notice.className = "competition-empty";
    notice.textContent = ["COMPLETED", "ARCHIVED"].includes(payload.competition.lifecycleState)
      ? "No published placements are available."
      : "Results have not been published yet.";
    section.append(notice);
    root.append(section);
    return;
  }

  const heading = document.createElement("div");
  heading.className = "competition-results-heading";
  const title = document.createElement("h2");
  title.textContent = "Final results";
  const note = document.createElement("p");
  note.textContent = "These placements are the permanent published result snapshot for this competition.";
  heading.append(title, note);

  const podium = document.createElement("div");
  podium.className = "competition-podium";
  for (const result of results.filter((item) => item.placement <= 3)) {
    podium.append(resultCard(result, payload.submissions, payload.competition, true));
  }

  const allHeading = document.createElement("h2");
  allHeading.textContent = "All placements";
  const list = document.createElement("div");
  list.className = "competition-result-list";
  for (const result of results) list.append(resultCard(result, payload.submissions, payload.competition));

  section.append(heading);
  if (podium.children.length) section.append(podium);
  section.append(allHeading, list);
  root.append(section);
}

function rewardIcon(reward) {
  if (reward.rewardType === "LORE_ITEM") return "../assets/competitions/reward-lore-item.png?v=2";
  if (reward.rewardType === "RANK") return "../assets/competitions/reward-profile-tag.png?v=3";
  const itemKey = reward.visual?.itemKey?.split(":").at(-1);
  const item = itemKey || (reward.rewardType === "MONEY" ? "raw_gold" : ["RANK", "PERMISSION"].includes(reward.rewardType) ? "name_tag" : reward.rewardType === "LORE_ITEM" ? "nether_star" : "emerald");
  return `../assets/market/minecraft/vanilla/textures/item/${encodeURIComponent(item)}.png`;
}

function rankRewardStyle(rank) {
  const value = String(rank || "").toLowerCase();
  if (value.includes("devotee")) return "devotee";
  if (value.includes("avid")) return "avid";
  return "default";
}

function rankRewardDuration(reward) {
  const minutes = reward.visual?.durationMinutes;
  if (minutes === null || minutes === undefined) return "Permanent";
  if (minutes % 525600 === 0) return `${minutes / 525600} year${minutes === 525600 ? "" : "s"}`;
  if (minutes % 43200 === 0) return `${minutes / 43200} month${minutes === 43200 ? "" : "s"}`;
  if (minutes % 10080 === 0) return `${minutes / 10080} week${minutes === 10080 ? "" : "s"}`;
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  return `${minutes} minutes`;
}

function rankRewardIcon(rank) {
  const style = rankRewardStyle(rank);
  return style === "devotee" ? "../assets/competitions/reward-rank-devotee.png?v=1" : style === "avid" ? "../assets/competitions/reward-rank-avid.png?v=1" : rewardIcon({ rewardType: "RANK" });
}

function showRewardDetailDialog(reward, iconUrl) {
  const dialog = document.createElement("dialog"); dialog.className = "competition-reward-dialog";
  const card = document.createElement("div"); card.className = `competition-reward-item-detail${reward.rewardType === "RANK" ? " is-tag" : ""}`;
  const close = document.createElement("button"); close.type = "button"; close.className = "competition-entry-dialog-close"; close.setAttribute("aria-label", "Close reward details"); close.textContent = "×"; close.addEventListener("click", () => dialog.close());
  const icon = document.createElement("img"); icon.src = iconUrl; icon.alt = "";
  const copy = document.createElement("div");
  if (reward.rewardType === "RANK") {
    const rankStyle = rankRewardStyle(reward.visual?.rank);
    const type = document.createElement("small"); type.textContent = rankStyle === "default" ? "Profile tag" : "Rank reward";
    const preview = document.createElement("strong");
    if (rankStyle === "default") { preview.className = `competition-reward-tag-preview tag-${String(reward.visual?.rank || "default").replace(/[^a-z0-9_-]/gi, "-")}`; preview.textContent = reward.publicLabel; }
    else { preview.className = "competition-rank-detail"; const emblem = document.createElement("img"); emblem.src = rankRewardIcon(reward.visual?.rank); emblem.alt = ""; const name = document.createElement("span"); name.textContent = reward.publicLabel; preview.append(emblem, name); }
    const note = document.createElement("p"); note.textContent = reward.publicDescription; copy.append(type, preview); if (rankStyle !== "default") { const duration = document.createElement("span"); duration.className = "competition-rank-duration"; duration.textContent = rankRewardDuration(reward); copy.append(duration); } copy.append(note); card.append(close, copy);
  }
  else { const title = document.createElement("h2"); title.textContent = reward.publicLabel; const lore = document.createElement("p"); lore.textContent = reward.publicDescription; const key = document.createElement("code"); key.textContent = reward.visual?.itemKey || "minecraft:item"; copy.append(title, lore, key); card.append(close, icon, copy); }
  dialog.append(card); document.body.append(dialog);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }); dialog.addEventListener("close", () => dialog.remove(), { once: true }); dialog.showModal();
}

function renderRewardsTab(root, payload) {
  const section = document.createElement("section");
  section.className = "competition-tab-panel competition-rewards-panel";
  section.dataset.tabPanel = "rewards";
  section.hidden = true;
  const definitions = [...(payload.competition.config?.rewards?.definitions ?? [])];
  if (payload.competition.slug === "skyline-archives") {
    if (!definitions.some((reward) => rankRewardStyle(reward.visual?.rank) === "devotee")) definitions.push({ id: "placeholder-devotee-rank", placement: 1, rewardType: "RANK", publicLabel: "Devotee rank", publicDescription: "The Devotee player rank for every member of the winning team.", visual: { rank: "devotee", durationMinutes: null } });
    if (!definitions.some((reward) => rankRewardStyle(reward.visual?.rank) === "avid")) definitions.push({ id: "placeholder-avid-rank", placement: 2, rewardType: "RANK", publicLabel: "Avid rank", publicDescription: "The Avid player rank for every member of the second-place team.", visual: { rank: "avid", durationMinutes: 43200 } });
  }
  const heading = document.createElement("div"); heading.className = "competition-results-heading";
  const title = document.createElement("h2"); title.textContent = "Competition rewards";
  const intro = document.createElement("p"); intro.textContent = ["COMPLETED", "ARCHIVED"].includes(payload.competition.lifecycleState) ? "The rewards assigned to each placed team." : "Rewards available for this competition.";
  heading.append(title, intro); section.append(heading);
  if (!definitions.length) { const empty = document.createElement("div"); empty.className = "competition-empty"; empty.textContent = "No rewards have been announced yet."; section.append(empty); root.append(section); return; }
  const groups = document.createElement("div"); groups.className = "competition-reward-place-groups";
  const placementGrids = new Map();
  for (const placement of [...new Set(definitions.map((reward) => reward.placement))].sort((a, b) => a - b)) {
    const rewardsForPlacement = definitions.filter((reward) => reward.placement === placement);
    const group = document.createElement("details"); group.className = `competition-reward-place-group place-${placement}`;
    const summary = document.createElement("summary"); const placeName = document.createElement("strong"); placeName.textContent = placementLabel(placement); const count = document.createElement("span"); count.textContent = `${rewardsForPlacement.length} reward${rewardsForPlacement.length === 1 ? "" : "s"}`; summary.append(placeName, count);
    const grid = document.createElement("div"); grid.className = "competition-reward-grid competition-reward-showcase";
    group.append(summary, grid); groups.append(group); placementGrids.set(placement, grid);
  }
  for (const reward of definitions) {
    const card = document.createElement("article"); card.className = "competition-reward-card";
    const iconWrap = document.createElement("button"); iconWrap.type = "button"; iconWrap.className = `competition-reward-icon reward-type-${reward.rewardType.toLowerCase().replaceAll("_", "-")}`;
    const styledRank = reward.rewardType === "RANK" && rankRewardStyle(reward.visual?.rank) !== "default";
    let icon;
    if (reward.rewardType === "RANK") { icon = document.createElement("img"); icon.src = rankRewardIcon(reward.visual?.rank); icon.alt = ""; icon.loading = "lazy"; if (rankRewardStyle(reward.visual?.rank) !== "default") iconWrap.classList.add("is-player-rank"); }
    else { icon = document.createElement("img"); icon.src = rewardIcon(reward); icon.alt = ""; icon.addEventListener("error", () => { icon.src = "../assets/market/minecraft/vanilla/textures/item/name_tag.png"; }, { once: true }); }
    iconWrap.append(icon);
    if (reward.visual?.amount) { const amount = document.createElement("span"); amount.textContent = `×${reward.visual.amount.toLocaleString()}`; iconWrap.append(amount); }
    if (styledRank) { const duration = document.createElement("span"); duration.className = "competition-rank-duration is-on-icon"; duration.textContent = rankRewardDuration(reward); iconWrap.append(duration); }
    const copy = document.createElement("div"); const place = document.createElement("span"); place.className = "competition-reward-placement"; place.textContent = placementLabel(reward.placement); const label = document.createElement("strong"); label.textContent = reward.rewardType === "LORE_ITEM" ? "Lore item" : styledRank ? reward.publicLabel : reward.rewardType === "RANK" ? "Profile tag" : reward.publicLabel; const description = document.createElement("p"); description.textContent = reward.rewardType === "LORE_ITEM" ? "One per member." : reward.rewardType === "RANK" ? "One per member." : reward.publicDescription; copy.append(place, label, description);
    if (["LORE_ITEM", "RANK"].includes(reward.rewardType)) { iconWrap.classList.add("is-clickable"); iconWrap.addEventListener("click", () => showRewardDetailDialog(reward, icon.src || "")); }
    const result = payload.results?.find((item) => item.placement === reward.placement); const entry = payload.submissions?.find((item) => item.id === result?.submissionId); const recipients = participantNames(entry);
    if (recipients.length) { const awarded = document.createElement("div"); awarded.className = "competition-reward-recipients"; const recipientLabel = document.createElement("small"); recipientLabel.textContent = "Awarded to"; const names = document.createElement("span"); names.textContent = recipients.join(" · "); awarded.append(recipientLabel, names); copy.append(awarded); }
    card.append(iconWrap, copy); placementGrids.get(reward.placement)?.append(card);
  }
  section.append(groups);
  root.append(section);
}

function renderJudges(root, payload) {
  const section = document.createElement("section");
  section.className = "competition-tab-panel";
  section.dataset.tabPanel = "judges";
  section.hidden = true;
  const title = document.createElement("h2"); title.textContent = "Competition judges";
  const intro = document.createElement("p"); intro.className = "competition-copy"; intro.textContent = "These players were assigned to score entries using the published judging criteria.";
  const grid = document.createElement("div"); grid.className = "competition-judges-grid";
  for (const judge of payload.judges ?? []) {
    const card = document.createElement("article"); card.className = "competition-judge-card";
    const image = document.createElement("img"); image.src = `https://mc-heads.net/avatar/${encodeURIComponent(judge.playerName)}/128`; image.alt = `${judge.playerName} Minecraft head`; image.loading = "lazy"; image.addEventListener("error", () => { image.src = "../assets/enthusia-logo-v2.png"; }, { once: true });
    const copy = document.createElement("div"); const name = document.createElement("strong"); name.textContent = judge.playerName; const role = document.createElement("span"); role.textContent = "Competition judge"; copy.append(name, role); card.append(image, copy); grid.append(card);
  }
  section.append(title, intro);
  if (grid.children.length) section.append(grid); else { const empty = document.createElement("div"); empty.className = "competition-empty"; empty.textContent = "No judges have been assigned yet."; section.append(empty); }
  root.append(section);
}

function renderRulesTab(root, competition) {
  const section = document.createElement("section"); section.className = "competition-tab-panel competition-document-panel"; section.dataset.tabPanel = "rules"; section.hidden = true;
  const kicker = document.createElement("p"); kicker.className = "competitions-kicker"; kicker.textContent = "Competition rules";
  const heading = document.createElement("h2"); heading.textContent = `Rules for ${competition.title}`;
  const intro = document.createElement("p"); intro.textContent = "These rules apply specifically to this competition. The main server rules still apply everywhere.";
  const rules = document.createElement("div"); rules.className = "competition-rules-list";
  const standard = [
    ["Submit original work", "Your entry must be created by you and the teammates listed on the entry. Credit every person who made a meaningful contribution."],
    ["Enter accurate information", "Titles, descriptions, participant names, guild details, and screenshots must honestly represent the submitted entry."],
    ["Protect private information", "Remove coordinates, waypoints, private chat, hidden base locations, personal information, and anything else that should not be published."],
    ["Keep content appropriate", "Entries may not contain harassment, hate, sexual or graphic material, advertisements, staff impersonation, or content that breaks the main server rules."],
    ["Follow the deadline", "The entry and all required changes must be submitted before the published deadline. Staff cannot promise extensions for late or incomplete work."],
    ["Respect review decisions", "Staff may request changes, deny an entry that does not meet the rules, or remove an approved entry if a problem is discovered later."],
    ["Do not manipulate voting", "Do not use alternate accounts, coordinated vote trading, pressure, rewards, or other methods intended to manipulate community voting or judging."],
    ["One identity per role", "Use your linked Minecraft identity. Owners, main participants, judges, and guild members are subject to the eligibility restrictions shown for the competition."]
  ];
  standard.forEach(([title, body], index) => { const item = document.createElement("section"); const number = document.createElement("span"); number.textContent = String(index + 1).padStart(2, "0"); const copy = document.createElement("div"); const h3 = document.createElement("h3"); h3.textContent = title; const p = document.createElement("p"); p.textContent = body; copy.append(h3, p); item.append(number, copy); rules.append(item); });
  const specific = text(competition.config?.public?.rules);
  section.append(kicker, heading, intro);
  if (specific) { const callout = document.createElement("div"); callout.className = "competition-rules-document"; const label = document.createElement("strong"); label.textContent = "Additional rules for this competition"; const body = document.createElement("p"); body.textContent = specific; callout.append(label, body); section.append(callout); }
  section.append(rules); root.append(section);
}

function renderGuideTab(root) {
  const section = document.createElement("section"); section.className = "competition-tab-panel competition-document-panel"; section.dataset.tabPanel = "guide"; section.hidden = true;
  const kicker = document.createElement("p"); kicker.className = "competitions-kicker"; kicker.textContent = "Competition guide";
  const heading = document.createElement("h2"); heading.textContent = "How competitions work";
  const intro = document.createElement("p"); intro.textContent = "A quick reference for entering, screenshots, review, voting, judging, and results.";
  const topics = [
    ["Before you enter", "Read the description, rules, dates, allowed entry types, and rewards. Competition-specific rules take priority over this general guide."],
    ["Making an entry", "Sign in with Discord, choose a linked Minecraft account, select an allowed entry type, add your title and description, include contributors, upload screenshots, and send the entry for review."],
    ["Screenshots", "There is no screenshot-count limit. Each PNG or JPEG may be up to 8 MB. Remove coordinates, waypoints, private chat, hidden base locations, and anything else you do not want published."],
    ["Staff review", "Staff checks entries against the published rules and image requirements. If changes are requested, the entry reopens for correction during the allowed period."],
    ["Voting", "When community voting is enabled and open, eligible signed-in players can review approved entries and submit the number of choices shown on the ballot."],
    ["Judging", "Assigned judges score approved entries using the published criteria. Private notes remain private; deliberately published feedback appears with the results."],
    ["Results", "Results appear only after final checks. Completed pages retain placements, entries, member rosters, public feedback, and prizes."]
  ];
  const list = document.createElement("div"); list.className = "competition-guide-topics";
  for (const [title, body] of topics) { const item = document.createElement("section"); const number = document.createElement("span"); number.className = "competition-guide-topic-number"; number.textContent = String(list.children.length + 1).padStart(2, "0"); const h3 = document.createElement("h3"); h3.textContent = title; const p = document.createElement("p"); p.textContent = body; item.append(number, h3, p); list.append(item); }
  section.append(kicker, heading, intro, list); root.append(section);
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
    const response = await fetch(`${API_ROOT}/${encodeURIComponent(slug)}`, {
      credentials: "same-origin",
      headers: { accept: "application/json" }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    const competition = payload.competition;
    document.title = `${competition.title} | Enthusia Competitions`;

    const shell = document.createElement("article");
    shell.className = "competition-detail-shell";
    const hero = document.createElement("header");
    hero.className = "competition-detail-hero";
    hero.style.setProperty("--competition-accent", accent(competition));

    const heroBanner = bannerImage(competition, "competition-detail-banner", "");
    if (heroBanner) {
      hero.classList.add("has-banner");
      hero.append(heroBanner);
    }

    const heroCopy = document.createElement("div");
    heroCopy.className = "competition-detail-hero-copy";
    const kicker = document.createElement("p");
    kicker.className = "competitions-kicker";
    kicker.textContent = `${stateLabel(competition.lifecycleState)} · ${competition.category}`;
    const heading = document.createElement("h1");
    heading.textContent = competition.title;
    const summary = document.createElement("p");
    summary.textContent = text(competition.config?.public?.summary, "Competition details");
    heroCopy.append(kicker, heading, summary);
    hero.append(heroCopy);

    const tabs = document.createElement("nav");
    tabs.className = "competition-detail-tabs";
    tabs.setAttribute("aria-label", "Competition sections");
    const completed = ["COMPLETED", "ARCHIVED"].includes(competition.lifecycleState);
    const tabDefinitions = [["overview", "Overview"], ["rules", "Rules"]];
    tabDefinitions.push(["rewards", "Rewards"]);
    if (!completed) tabDefinitions.push(["guide", "How to enter"]);
    if (payload.entriesVisible && !completed) tabDefinitions.push(["entries", "Entries"]);
    if (competition.config?.voting?.enabled && competition.lifecycleState === "VOTING") tabDefinitions.push(["vote", "Vote"]);
    if (competition.config?.judging?.enabled) tabDefinitions.push(["judges", "Judges"]);
    if (completed && payload.results?.length) tabDefinitions.push(["results", "Results"]);
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
    renderOverview(content, payload);
    renderRulesTab(content, competition);
    renderRewardsTab(content, payload);
    if (!completed) renderGuideTab(content);
    if (payload.entriesVisible && !completed) renderEntries(content, payload);
    if (competition.config?.voting?.enabled && competition.lifecycleState === "VOTING") renderPlaceholderPanel(content, "vote", "Voting is open. Sign in to review approved entries and submit your ballot.");
    if (competition.config?.judging?.enabled) renderJudges(content, payload);
    if (completed && payload.results?.length) renderResults(content, payload);

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
