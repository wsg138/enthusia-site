import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("completed competition overview includes winner dates prizes members and entry viewer", async () => {
  const source = await readFile(new URL("../public/assets/competitions.js", import.meta.url), "utf8");
  for (const marker of ["competition-completed-summary", "Started", "Ended", "participantLabel", "showEntryDialog", "Previous entry", "Next entry", "openImageLightbox", "competition-entry-gallery"]) assert.match(source, new RegExp(marker));
  assert.doesNotMatch(source, /competition-winner-prizes/);
});

test("voting and judging tabs are conditional", async () => {
  const source = await readFile(new URL("../public/assets/competitions.js", import.meta.url), "utf8");
  assert.match(source, /voting\?\.enabled && competition\.lifecycleState === "VOTING"/);
  assert.match(source, /judging\?\.enabled\) tabDefinitions\.push\(\["judges", "Judges"\]\)/);
  assert.match(source, /mc-heads\.net\/avatar/);
});

test("competition tabs follow lifecycle visibility", async () => {
  const source = await readFile(new URL("../public/assets/competitions.js", import.meta.url), "utf8");
  assert.match(source, /const tabDefinitions = \[\["overview", "Overview"\], \["rules", "Rules"\]\]/);
  assert.match(source, /if \(!completed\) tabDefinitions\.push\(\["guide", "How to enter"\]\)/);
  assert.match(source, /if \(payload\.entriesVisible && !completed\) tabDefinitions\.push\(\["entries", "Entries"\]\)/);
  assert.match(source, /if \(completed && payload\.results\?\.length\) tabDefinitions\.push\(\["results", "Results"\]\)/);
  assert.match(source, /slide-01\.webp/);
});

test("result scores follow enabled voting and judging modes", async () => {
  const source = await readFile(new URL("../public/assets/competitions.js", import.meta.url), "utf8");
  assert.match(source, /competition\.config\?\.voting\?\.enabled && result\.communityComponent/);
  assert.match(source, /competition\.config\?\.judging\?\.enabled && result\.judgeComponent/);
  assert.match(source, /competition-score-breakdown/);
});

test("rules guide winner members and entry viewer use structured layouts", async () => {
  const source = await readFile(new URL("../public/assets/competitions.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../public/assets/competitions.css", import.meta.url), "utf8");
  for (const marker of ["Submit original work", "Enter accurate information", "Follow the deadline", "competition-guide-topic-number", "competition-entry-gallery", "event.target === dialog"]) {
    assert.match(source, new RegExp(marker));
  }
  for (const marker of ["competition-document-panel", "margin-inline:\\s*auto", "competition-winner-member", "competition-entry-gallery"]) {
    assert.match(styles, new RegExp(marker));
  }
});

test("detail view includes responsive skins, gallery lightbox, two-column rules, and rewards", async () => {
  const source = await readFile(new URL("../public/assets/competitions.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../public/assets/competitions.css", import.meta.url), "utf8");
  for (const marker of ["mc-heads.net/body", "renderRewardsTab", "competition-image-lightbox", "Awarded to", "rewardIcon", "raw_gold", "showRewardDetailDialog", "competition-result-head", "competition-result-skin", "competition-entry-member"]) assert.match(source, new RegExp(marker));
  assert.match(styles, /competition-rules-list\{grid-template-columns:repeat\(2/);
  assert.match(styles, /competition-entry-gallery\{display:grid;grid-template-columns:repeat\(3/);
  assert.match(styles, /competition-winner-members\[data-count="1"\]/);
  assert.match(styles, /competition-reward-tag/);
  assert.match(styles, /competition-reward-icon\.is-enchanted/);
});

test("about documentation explains PieCloak from its public contract", async () => {
  const page = await readFile(new URL("../public/plugins.html", import.meta.url), "utf8");
  assert.match(page, /id="piecloak"/);
  assert.match(page, /Within 24 blocks/);
  assert.match(page, /From 24–48 blocks/);
  assert.match(page, /does not hide players or ordinary base blocks/);
  assert.match(page, /enthusia\.miraheze\.org\/wiki\/Main_Page/);
  assert.doesNotMatch(page, /Managed clues|base clues/);
  assert.match(page, /build underground/);
  assert.doesNotMatch(page, /exterior wall/);
  assert.match(page, /copper golems/);
});

test("completed entry cards show equal player lists and podium styling", async () => {
  const source = await readFile(new URL("../public/assets/competitions.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../public/assets/competitions.css", import.meta.url), "utf8");
  assert.match(source, /participantNames/);
  assert.match(source, /submission-podium-mark/);
  assert.match(source, /is-place-\$\{placement\}/);
  for (const marker of ["is-place-1", "is-place-2", "is-place-3"]) assert.match(styles, new RegExp(marker));
});

test("competition navigation separates back and guide actions", async () => {
  const page = await readFile(new URL("../public/competitions/detail.html", import.meta.url), "utf8");
  assert.match(page, /competition-back-link/);
  assert.match(page, /competition-guide-link/);
});

test("judge assignment supports username lookup and linked-player selection", async () => {
  const endpoint = await readFile(new URL("../functions/api/competitions/admin/[id]/judges.js", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../public/assets/competitions-admin-workspace.js", import.meta.url), "utf8");
  assert.match(endpoint, /competitionPlayerLookup/);
  assert.match(endpoint, /linkedPlayers/);
  assert.match(workspace, /Select a linked player/);
});

test("public preview uses the self-hosted Minecraft font and contains mobile podium scores", async () => {
  const siteStyles = await readFile(new URL("../public/assets/styles.css", import.meta.url), "utf8");
  const competitionStyles = await readFile(new URL("../public/assets/competitions.css", import.meta.url), "utf8");
  const config = await readFile(new URL("../public/assets/site-config.js", import.meta.url), "utf8");
  assert.match(siteStyles, /@font-face\{font-family:"Enthusia Minecraft"/);
  assert.match(siteStyles, /html body \.brand-name,html body \.hero h1,html body \.hero h1 span,html body \.hero h1 strong\{font-family:Rye/);
  assert.match(competitionStyles, /grid-template-columns:repeat\(auto-fit,minmax\(104px,1fr\)\)/);
  assert.match(competitionStyles, /\.competition-podium-card h3,\.competition-result-players\{overflow-wrap:anywhere/);
  assert.match(config, /statLabel: "Raw Gold"/);
  const source = await readFile(new URL("../public/assets/competitions.js", import.meta.url), "utf8");
  assert.match(source, /reward\.rewardType === "MONEY" \? `\$\{Number\(reward\.visual\?\.amount \?\? 0\)\.toLocaleString\(\)\} Raw Gold`/);
});
