import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { galleryMediaKey } from "../functions/lib/competitions/media-storage.js";
import { galleryStaffAccess, SUBMITTABLE_CATEGORIES } from "../functions/lib/gallery.js";

const fresh = new Date().toISOString();
const idPrefix = "1".repeat(17);
const ids = {
  helper: `${idPrefix}1`,
  mod: `${idPrefix}2`,
  dev: `${idPrefix}3`,
  admin: `${idPrefix}4`,
  founder: `${idPrefix}5`
};
const env = { DISCORD_HELPER_ROLE_IDS: ids.helper, DISCORD_MODERATOR_ROLE_IDS: ids.mod, DISCORD_DEVELOPER_ROLE_IDS: ids.dev, DISCORD_ADMIN_ROLE_IDS: ids.admin, DISCORD_FOUNDER_ROLE_IDS: ids.founder };

test("only Community Builds and Mapart accept player submissions", () => {
  assert.deepEqual([...SUBMITTABLE_CATEGORIES], ["COMMUNITY_BUILDS", "MAPART"]);
});

test("gallery staff hierarchy gives review to Helper and management to Developer", () => {
  assert.deepEqual(galleryStaffAccess({ guildRoleIds: [ids.helper], discordRolesCheckedAt: fresh }, env), { review: true, manage: false, reauthenticationRequired: false });
  assert.deepEqual(galleryStaffAccess({ guildRoleIds: [ids.dev], discordRolesCheckedAt: fresh }, env), { review: true, manage: true, reauthenticationRequired: false });
  assert.equal(galleryStaffAccess({ guildRoleIds: [], discordRolesCheckedAt: fresh }, env).review, false);
});

test("stale Discord role snapshots fail closed", () => {
  const stale = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  assert.deepEqual(galleryStaffAccess({ guildRoleIds: [ids.founder], discordRolesCheckedAt: stale }, env), { review: false, manage: false, reauthenticationRequired: true });
});

test("gallery media uses a separate private key namespace", () => {
  assert.equal(galleryMediaKey({ mediaId: "11111111-1111-4111-8111-111111111111", extension: "png" }), "gallery/submissions/11111111-1111-4111-8111-111111111111.png");
});

test("public media route is approved-only and Gallery documents all six categories", async () => {
  const media = await readFile(new URL("../functions/api/gallery/media/[id].js", import.meta.url), "utf8");
  const page = await readFile(new URL("../public/gallery.html", import.meta.url), "utf8");
  const browser = await readFile(new URL("../public/assets/gallery.js", import.meta.url), "utf8");
  assert.match(media, /status = 'APPROVED'/);
  for (const category of ["COMMUNITY_BUILDS", "PVP", "BETA_1", "BETA_2", "BETA_3", "MAPART"]) {
    assert.ok(page.includes(category), `Missing Gallery category: ${category}`);
  }
  assert.match(page, /Every image is reviewed before it appears here/);
  assert.doesNotMatch(browser, /\.innerHTML\s*=/);
  assert.match(browser, /replaceChildren/);
});
