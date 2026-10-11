import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("punishment code claim requires the linked website identity path", async () => {
  const source = await readFile(new URL("../functions/api/appeals/claim.js", import.meta.url), "utf8");
  assert.match(source, /authenticateLinkedAppealRequest/);
  assert.doesNotMatch(source, /authenticateAppealRequest\(/);
  assert.match(source, /saveClaimedPunishmentBinding/);
});

test("profile exposes owned punishment state without sending binding authority from the browser", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("../public/account.html", import.meta.url), "utf8"),
    readFile(new URL("../public/assets/account-punishments.js", import.meta.url), "utf8")
  ]);
  assert.match(html, /id="account-punishment-bindings"/);
  assert.match(html, /account-punishments\.js\?v=1/);
  assert.match(script, /\/api\/appeals\/bindings/);
  assert.match(script, /\/api\/appeals\/revalidate/);
  assert.match(script, /JSON\.stringify\(\{ punishmentId: binding\.punishmentId \}\)/);
  assert.doesNotMatch(script, /JSON\.stringify\([^\n]*accountId/);
  assert.doesNotMatch(script, /JSON\.stringify\([^\n]*codeGeneration/);
  assert.match(script, /CODE_ROTATED/);
});
