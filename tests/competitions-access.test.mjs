import assert from "node:assert/strict";
import test from "node:test";

import {
  canManageCompetitions,
  canModerateCompetitions,
  canPreviewCompetitions,
  competitionManagerRoles,
  competitionModeratorRoles,
  competitionPreviewRoles,
  competitionsEnabled,
  competitionsPublicAccessEnabled,
  hasCompetitionDatabase,
  hasCompetitionMedia
} from "../functions/lib/competitions/access.js";

const session = (...roles) => ({ roles });

test("competition feature is disabled unless explicitly enabled", () => {
  assert.equal(competitionsEnabled({}), false);
  assert.equal(competitionsEnabled({ COMPETITIONS_ENABLED: "false" }), false);
  assert.equal(competitionsEnabled({ COMPETITIONS_ENABLED: "TRUE" }), true);
});

test("public competition pages stay private unless explicitly opened", () => {
  assert.equal(competitionsPublicAccessEnabled({}), false);
  assert.equal(competitionsPublicAccessEnabled({ COMPETITIONS_PUBLIC_ACCESS: "false" }), false);
  assert.equal(competitionsPublicAccessEnabled({ COMPETITIONS_PUBLIC_ACCESS: "TRUE" }), true);
});

test("default competition management roles are Founder and Admin", () => {
  assert.deepEqual(competitionManagerRoles({}), ["founder", "admin"]);
  assert.equal(canManageCompetitions(session("founder"), {}), true);
  assert.equal(canManageCompetitions(session("admin"), {}), true);
  assert.equal(canManageCompetitions(session("moderator"), {}), false);
  assert.equal(canManageCompetitions(session("developer"), {}), false);
});

test("default preview roles are Founder and Admin until beta access is widened", () => {
  assert.deepEqual(competitionPreviewRoles({}), ["founder", "admin"]);
  assert.equal(canPreviewCompetitions(session("founder"), {}), true);
  assert.equal(canPreviewCompetitions(session("admin"), {}), true);
  assert.equal(canPreviewCompetitions(session("moderator"), {}), false);
  assert.equal(canPreviewCompetitions(session("member"), {}), false);
});

test("default moderation roles include Moderator and Developer", () => {
  assert.deepEqual(
    competitionModeratorRoles({}),
    ["founder", "admin", "moderator", "developer"]
  );
  assert.equal(canModerateCompetitions(session("moderator"), {}), true);
  assert.equal(canModerateCompetitions(session("developer"), {}), true);
  assert.equal(canModerateCompetitions(session("member"), {}), false);
});

test("competition role lists can be configured without changing defaults in code", () => {
  const env = {
    COMPETITIONS_MANAGER_ROLES: "founder,admin,owner",
    COMPETITIONS_MODERATOR_ROLES: "founder,admin,helper",
    COMPETITIONS_PREVIEW_ROLES: "founder,admin,beta"
  };
  assert.equal(canManageCompetitions(session("owner"), env), true);
  assert.equal(canModerateCompetitions(session("developer"), env), false);
  assert.equal(canModerateCompetitions(session("helper"), env), true);
  assert.equal(canPreviewCompetitions(session("beta"), env), true);
});

test("competition bindings are detected by capability rather than truthiness alone", () => {
  assert.equal(hasCompetitionDatabase({ COMPETITIONS_DB: {} }), false);
  assert.equal(hasCompetitionDatabase({ COMPETITIONS_DB: { prepare() {} } }), true);
  assert.equal(hasCompetitionMedia({ COMPETITIONS_MEDIA: {} }), false);
  assert.equal(hasCompetitionMedia({ COMPETITIONS_MEDIA: { get() {} } }), true);
});
