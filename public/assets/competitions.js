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
  const url = bannerMediaUrl(competition);
  if (!url) return null;
  const image = document.createElement("img");
  image.className = className;
  image.src = url;
  image.alt = alt;
  image.loading = "lazy";
  image.decoding = "async";
  image.referrerPolicy = "same-origin";
  image.addEventListener("error", () => image.remove(), { once: true });
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
    if (winnerEntry?.coverImageUrl) {
      const image = document.createElement("img");
      image.src = winnerEntry.coverImageUrl;
      image.alt = `${winnerEntry.title} cover image`;
      winner.append(image);
    }
    const copy = document.createElement("div");
    const eyebrow = document.createElement("p"); eyebrow.className = "competitions-kicker"; eyebrow.textContent = "Winner";
    const heading = document.createElement("h2"); heading.textContent = winnerResult.title;
    const owner = document.createElement("p"); owner.textContent = winnerResult.entryType === "GUILD" && winnerResult.guildName ? `${winnerResult.guildName} · submitted by ${winnerResult.ownerName}` : `By ${winnerResult.ownerName}`;
    copy.append(eyebrow, heading, owner);
    const members = document.createElement("div"); members.className = "competition-entry-members";
    for (const participant of winnerEntry?.participants ?? []) { const member = document.createElement("span"); member.className = "submission-member"; member.textContent = participantLabel(participant); members.append(member); }
    if (members.children.length) copy.append(members);
    const prizes = (competition.config?.rewards?.definitions ?? []).filter((reward) => reward.placement === 1);
    if (prizes.length) { const prizeList = document.createElement("div"); prizeList.className = "competition-winner-prizes"; for (const prize of prizes) { const item = document.createElement("span"); item.textContent = `${prize.publicLabel}: ${prize.publicDescription}`; prizeList.append(item); } copy.append(prizeList); }
    const view = document.createElement("button"); view.type = "button"; view.className = "competition-primary-action"; view.textContent = "View winning entry"; view.addEventListener("click", () => showEntryDialog(payload.submissions, winnerEntry?.id)); copy.append(view);
    winner.append(copy); summary.append(dates, winner); section.append(summary);
  }

  const description = document.createElement("div");
  description.className = "competition-copy";
  description.textContent = text(config.public?.description, config.public?.summary || "No description has been published yet.");

  const guide = document.createElement("div");
  guide.className = "competition-guide-callout";
  const guideCopy = document.createElement("div");
  const guideHeading = document.createElement("h2");
  guideHeading.textContent = "New to competitions?";
  const guideText = document.createElement("p");
  guideText.textContent = "Read the competition guide for entry steps, screenshots, voting, judging, schedules, and results.";
  guideCopy.append(guideHeading, guideText);
  const guideLink = document.createElement("a");
  guideLink.className = "competition-primary-action";
  guideLink.href = "guide.html";
  guideLink.textContent = "Read the competition guide";
  guide.append(guideCopy, guideLink);

  section.append(description, guide);

  const fullDetails = document.createElement("details");
  fullDetails.className = "competition-full-details";
  const fullDetailsSummary = document.createElement("summary");
  fullDetailsSummary.textContent = "View all competition settings";
  const detailList = document.createElement("dl");
  const addDetail = (label, value) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    row.append(term, description);
    detailList.append(row);
  };
  const entries = config.entries ?? {};
  const voting = config.voting ?? {};
  const judging = config.judging ?? {};
  addDetail("Entry types", (entries.allowedTypes ?? []).map((type) => type.toLowerCase()).join(", ") || "Not listed");
  addDetail("Entries per player", String(entries.maxEntriesPerPlayer ?? "Not listed"));
  if ((entries.allowedTypes ?? []).includes("GUILD")) addDetail("Entries per guild", String(entries.maxEntriesPerGuild ?? "Not listed"));
  if ((entries.allowedTypes ?? []).includes("GROUP")) addDetail("Main group members", entries.maxMainMembers ? `Up to ${entries.maxMainMembers}` : "Not listed");
  addDetail("Screenshots", `At least ${entries.minImages ?? 1}; no maximum. PNG or JPEG, up to 8 MB each.`);
  addDetail("Community voting", voting.enabled ? `${voting.votesPerVoter ?? "Published"} choices per voter` : "Not used for this competition");
  if (voting.enabled) addDetail("Voting eligibility", `${voting.minimumActiveMinutes ?? 0} active minutes required`);
  addDetail("Judging", judging.enabled ? `${(judging.criteria ?? []).length} published scoring criteria` : "Not used for this competition");
  addDetail("Private coordinates", entries.coordinatesRequested ? "Requested for staff review" : "Not requested");
  fullDetails.append(fullDetailsSummary, detailList);
  section.append(fullDetails);
  if (config.entries?.coordinatesRequested && config.entries?.judgesCanViewCoordinates) {
    const warning = document.createElement("div");
    warning.className = "competition-private-warning";
    warning.textContent = "This competition requests private build coordinates. Assigned judges will be allowed to see those coordinates for judging.";
    section.append(warning);
  }

  renderRewards(section, competition);

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

function showEntryDialog(submissions, selectedId) {
  const entries = Array.isArray(submissions) ? submissions : [];
  let entryIndex = Math.max(0, entries.findIndex((entry) => entry.id === selectedId));
  let imageIndex = 0;
  const dialog = document.createElement("dialog");
  dialog.className = "competition-entry-dialog";
  const view = document.createElement("div"); view.className = "competition-entry-view";
  const close = document.createElement("button"); close.type = "button"; close.className = "competition-entry-dialog-close"; close.setAttribute("aria-label", "Close entry"); close.textContent = "×"; close.addEventListener("click", () => dialog.close());
  const render = () => {
    const entry = entries[entryIndex]; if (!entry) { dialog.close(); return; }
    imageIndex = Math.min(imageIndex, Math.max(0, (entry.images?.length ?? 1) - 1));
    const header = document.createElement("header");
    const type = document.createElement("p"); type.className = "competitions-kicker"; type.textContent = entry.entryType;
    const heading = document.createElement("h2"); heading.textContent = entry.title;
    const owner = document.createElement("p"); owner.textContent = entry.entryType === "GUILD" && entry.guildName ? `${entry.guildName} · submitted by ${entry.ownerName}` : `By ${entry.ownerName}`;
    const description = document.createElement("p"); description.textContent = entry.description;
    header.append(type, heading, owner, description);
    const members = document.createElement("div"); members.className = "competition-entry-members";
    for (const participant of entry.participants ?? []) { const item = document.createElement("span"); item.className = "submission-member"; item.textContent = participantLabel(participant); members.append(item); }
    const media = document.createElement("div");
    const images = entry.images ?? [];
    if (images.length) {
      const image = document.createElement("img"); image.className = "competition-entry-image"; image.src = images[imageIndex].url; image.alt = `${entry.title}, image ${imageIndex + 1} of ${images.length}`; media.append(image);
      if (images.length > 1) { const imageNav = document.createElement("div"); imageNav.className = "competition-entry-image-nav"; const previous = document.createElement("button"); previous.className = "competition-back-link"; previous.textContent = "← Previous image"; previous.disabled = imageIndex === 0; previous.addEventListener("click", () => { imageIndex--; render(); }); const count = document.createElement("span"); count.textContent = `${imageIndex + 1} of ${images.length}`; const next = document.createElement("button"); next.className = "competition-back-link"; next.textContent = "Next image →"; next.disabled = imageIndex === images.length - 1; next.addEventListener("click", () => { imageIndex++; render(); }); imageNav.append(previous, count, next); media.append(imageNav); }
    }
    const recordNav = document.createElement("div"); recordNav.className = "competition-entry-record-nav";
    const previousEntry = document.createElement("button"); previousEntry.className = "competition-back-link"; previousEntry.textContent = "← Previous entry"; previousEntry.disabled = entryIndex === 0; previousEntry.addEventListener("click", () => { entryIndex--; imageIndex = 0; render(); });
    const nextEntry = document.createElement("button"); nextEntry.className = "competition-back-link"; nextEntry.textContent = "Next entry →"; nextEntry.disabled = entryIndex === entries.length - 1; nextEntry.addEventListener("click", () => { entryIndex++; imageIndex = 0; render(); }); recordNav.append(previousEntry, nextEntry);
    view.replaceChildren(close, header); if (members.children.length) view.append(members); view.append(media, recordNav);
  };
  dialog.append(view); document.body.append(dialog); dialog.addEventListener("close", () => dialog.remove(), { once: true }); render(); dialog.showModal();
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
    card.className = "submission-card is-clickable";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
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
    card.addEventListener("click", (event) => { if (!event.target.closest("button,a")) showEntryDialog(submissions, submission.id); });
    card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); showEntryDialog(submissions, submission.id); } });
    grid.append(card);
  }
  section.append(grid);
  root.append(section);
}

function scoreText(result) {
  const parts = [`Final ${Number(result.finalScore).toFixed(2)}`];
  if (result.communityComponent !== null && result.communityComponent !== undefined) {
    parts.push(`Community ${Number(result.communityComponent).toFixed(2)}`);
  }
  if (result.judgeComponent !== null && result.judgeComponent !== undefined) {
    parts.push(`Judges ${Number(result.judgeComponent).toFixed(2)}`);
  }
  return parts.join(" · ");
}

function resultName(result) {
  return result.entryType === "GUILD" && result.guildName
    ? result.guildName
    : result.ownerName;
}

function resultCard(result, submissions, podium = false) {
  const card = document.createElement("article");
  card.className = `${podium ? "competition-podium-card" : "competition-result-row"} is-clickable`;
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.dataset.placement = String(result.placement);

  const place = document.createElement("strong");
  place.className = "competition-result-place";
  place.textContent = placementLabel(result.placement);
  const copy = document.createElement("div");
  const heading = document.createElement("h3");
  heading.textContent = result.title;
  const owner = document.createElement("p");
  owner.textContent = result.entryType === "GUILD" && result.guildName
    ? `${result.guildName} · submitted by ${result.ownerName}`
    : `By ${resultName(result)}`;
  const score = document.createElement("span");
  score.className = "competition-result-score";
  score.textContent = scoreText(result);
  copy.append(heading, owner, score);
  card.append(place, copy);
  if (result.staffEdited) {
    const edited = document.createElement("span");
    edited.className = "staff-edited-label";
    edited.textContent = "Edited by staff";
    card.append(edited);
  }
  card.addEventListener("click", (event) => { if (!event.target.closest("button,a")) showEntryDialog(submissions, result.submissionId); });
  card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); showEntryDialog(submissions, result.submissionId); } });
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
    podium.append(resultCard(result, payload.submissions, true));
  }

  const allHeading = document.createElement("h2");
  allHeading.textContent = "All placements";
  const list = document.createElement("div");
  list.className = "competition-result-list";
  for (const result of results) list.append(resultCard(result, payload.submissions));

  section.append(heading);
  if (podium.children.length) section.append(podium);
  section.append(allHeading, list);
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
    const image = document.createElement("img"); image.src = `https://mc-heads.net/avatar/${encodeURIComponent(judge.playerName)}/128`; image.alt = `${judge.playerName} Minecraft head`; image.loading = "lazy";
    const copy = document.createElement("div"); const name = document.createElement("strong"); name.textContent = judge.playerName; const role = document.createElement("span"); role.textContent = "Competition judge"; copy.append(name, role); card.append(image, copy); grid.append(card);
  }
  section.append(title, intro);
  if (grid.children.length) section.append(grid); else { const empty = document.createElement("div"); empty.className = "competition-empty"; empty.textContent = "No judges have been assigned yet."; section.append(empty); }
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
    const tabDefinitions = [["overview", "Overview"], ["entries", "Entries"]];
    if (competition.config?.voting?.enabled && !completed) tabDefinitions.push(["vote", "Vote"]);
    if (competition.config?.judging?.enabled) tabDefinitions.push(["judges", "Judges"]);
    tabDefinitions.push(["results", "Results"]);
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
    renderEntries(content, payload);
    if (competition.config?.voting?.enabled && !completed) renderPlaceholderPanel(content, "vote", "Voting controls will appear here when the authenticated voting flow is enabled.");
    if (competition.config?.judging?.enabled) renderJudges(content, payload);
    renderResults(content, payload);

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
