import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("completed competition overview includes winner dates prizes members and entry viewer", async () => {
  const source = await readFile(new URL("../public/assets/competitions.js", import.meta.url), "utf8");
  for (const marker of ["competition-completed-summary", "Started", "Ended", "competition-winner-prizes", "participantLabel", "showEntryDialog", "Previous entry", "Next entry", "Previous image", "Next image"]) assert.match(source, new RegExp(marker));
});

test("voting and judging tabs are conditional", async () => {
  const source = await readFile(new URL("../public/assets/competitions.js", import.meta.url), "utf8");
  assert.match(source, /voting\?\.enabled && !completed/);
  assert.match(source, /judging\?\.enabled\) tabDefinitions\.push\(\["judges", "Judges"\]\)/);
  assert.match(source, /mc-heads\.net\/avatar/);
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
