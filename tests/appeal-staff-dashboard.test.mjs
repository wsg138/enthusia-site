import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { staffCapabilities } from "../functions/api/reviewer/session.js";

test("staff dashboard capabilities keep appeal review and competition management separate", () => {
  const env = {
    APPEAL_REVIEWER_ROLES: "founder,admin,moderator",
    COMPETITIONS_ENABLED: "true",
    COMPETITIONS_MANAGER_ROLES: "founder,admin"
  };
  assert.deepEqual(staffCapabilities({ roles: ["moderator"] }, env), {
    appeals: true,
    competitions: false
  });
  assert.deepEqual(staffCapabilities({ roles: ["founder"] }, env), {
    appeals: true,
    competitions: true
  });
  assert.deepEqual(staffCapabilities({ roles: ["helper"] }, env), {
    appeals: false,
    competitions: false
  });
  assert.equal(staffCapabilities({ roles: ["admin"] }, { ...env, COMPETITIONS_ENABLED: "false" }).competitions, false);
});

test("staff dashboard is private, capability-aware, and links to maintained workspaces", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("../public/reviewer/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/assets/reviewer-dashboard.js", import.meta.url), "utf8")
  ]);
  assert.match(html, /name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(html, /href="appeals\.html"/);
  assert.match(html, /href="\.\.\/competitions\/admin\/"/);
  assert.match(script, /requestJson\("\/api\/reviewer\/session"\)/);
  assert.match(script, /status=OPEN/);
  assert.match(script, /status=INFORMATION_REQUESTED/);
  assert.match(script, /Promise\.allSettled\(jobs\)/);
  assert.doesNotMatch(script, /innerHTML/);
});
