import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("appeal page requires linked punishment selection and asks separate detailed questions", async () => {
  const html = await readFile(new URL("../public/appeal.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /punishment code|Staff will only see|linking is being added/i);
  assert.match(html, /id="appeal-form"[^>]*hidden/);
  assert.match(html, /id="appeal-account"/);
  assert.match(html, /id="appeal-punishment"/);
  assert.match(html, /id="appeal-what-happened"[^>]*minlength="150"[^>]*maxlength="4000"/);
  assert.match(html, /id="appeal-rule-understanding"[^>]*minlength="100"/);
  assert.match(html, /Short, copied, or incomplete appeals are denied/);
  assert.match(html, /id="appeal-files"[^>]*multiple/);
  assert.match(html, /data-format="bold"/);
  assert.match(html, /id="appeal-history-panel"/);
  assert.match(html, /id="appeal-history"/);
  assert.match(html, /data-appeal-view="history"/);
  assert.match(html, /data-appeal-view="new"/);
});

test("staff appeal workspace is private and uses its maintained script", async () => {
  const html = await readFile(new URL("../public/reviewer/appeals.html", import.meta.url), "utf8");
  assert.match(html, /name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(html, /src="\.\.\/assets\/reviewer-appeals\.js\?v=3"/);
  assert.match(html, /id="review-search"/);
  assert.doesNotMatch(html, /<script type="module">/);
});

test("profile menu links to appeal history and dismisses when it is no longer in use", async () => {
  const [html, menu] = await Promise.all([
    readFile(new URL("../public/account.html", import.meta.url), "utf8"),
    readFile(new URL("../public/assets/site-account.js", import.meta.url), "utf8")
  ]);
  assert.match(html, /id="account-session"/);
  assert.match(html, /<h1>Your profile<\/h1>/);
  assert.match(menu, /menuLink\("Profile", "\/account\.html"/);
  assert.match(menu, /menuLink\("Appeals", "\/appeal\.html#history"/);
  assert.match(menu, /\/account\.html/);
  assert.match(menu, /window\.addEventListener\("scroll", \(\) => closeAccountMenus\(\)/);
  assert.match(menu, /event\.key === "Escape"/);
});
