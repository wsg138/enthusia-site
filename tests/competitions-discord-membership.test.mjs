import assert from "node:assert/strict";
import test from "node:test";

import { discordMembershipError, MEMBERSHIP_MAX_AGE_MS } from "../functions/lib/competitions/participant-auth.js";

test("competition participation requires current Discord membership", () => {
  const now = Date.parse("2026-08-24T12:00:00.000Z");
  assert.equal(discordMembershipError({ discordGuildMember: false, discordRolesCheckedAt: new Date(now).toISOString() }, now), "discord_membership_required");
  assert.equal(discordMembershipError({ discordGuildMember: true, discordRolesCheckedAt: new Date(now - MEMBERSHIP_MAX_AGE_MS - 1).toISOString() }, now), "discord_reauthentication_required");
  assert.equal(discordMembershipError({ discordGuildMember: true, discordRolesCheckedAt: new Date(now - 60_000).toISOString() }, now), null);
});
