import assert from "node:assert/strict";
import test from "node:test";
import { loadOwnedPunishmentAppeals, ownedPunishmentAppealLink } from "../public/assets/punishment-appeal-links.js";
const account = { uuid: "11111111-1111-4111-8111-111111111111", name: "PlayerOne" };
const candidate = { id: "22222222-2222-4222-8222-222222222222", caseId: "0123456789ABCDEF", type: "NETWORK_BAN", createdAt: "2026-10-01T12:00:00Z", minecraftUuid: account.uuid, minecraftName: account.name, active: true, appealable: true };
const publicRecord = { player: account.name, punishmentType: "BAN", caseId: candidate.caseId, issuedAt: candidate.createdAt, appealAvailable: true };
const response = body => ({ ok: true, json: async () => body });

test("anonymous visitors have no record-specific appeal links", async () => {
  let calls = 0;
  const owned = await loadOwnedPunishmentAppeals(async () => { calls++; return response({ authenticated: false }); });
  assert.deepEqual(owned, []); assert.equal(calls, 1);
  assert.equal(ownedPunishmentAppealLink(publicRecord, owned), null);
});

test("linked name alone does not grant an appeal link when ownership lookup fails", async () => {
  const owned = await loadOwnedPunishmentAppeals(async path => {
    if (path.includes("auth/session")) return response({ authenticated: true, linkedMinecraftAccounts: [account], linkedPunishmentAppeals: true });
    return { ok: false };
  });
  assert.equal(ownedPunishmentAppealLink(publicRecord, owned), null);
});

test("verified owned punishments produce a preselected link and respect cooldown", async () => {
  const owned = await loadOwnedPunishmentAppeals(async path => response(path.includes("auth/session")
    ? { authenticated: true, linkedMinecraftAccounts: [account], linkedPunishmentAppeals: true }
    : { punishments: [candidate, { ...candidate, minecraftUuid: "33333333-3333-4333-8333-333333333333" }], nextCursor: null }));
  assert.equal(owned.length, 1);
  const link = new URL(ownedPunishmentAppealLink(publicRecord, owned), "https://enthusia.info");
  assert.equal(link.searchParams.get("minecraftUuid"), account.uuid);
  assert.equal(link.searchParams.get("punishmentId"), candidate.id);
  assert.equal(ownedPunishmentAppealLink({ ...publicRecord, player: "OtherPlayer" }, owned), null);
  assert.equal(ownedPunishmentAppealLink({ ...publicRecord, caseId: "0000000000000001" }, owned), null);
  assert.equal(ownedPunishmentAppealLink({ ...publicRecord, issuedAt: "2026-10-02T12:00:00Z" }, owned), null);
  assert.equal(ownedPunishmentAppealLink(publicRecord, [{ ...candidate, appealable: false }]), null);
  assert.equal(ownedPunishmentAppealLink(publicRecord, [{ ...candidate, id: "../other" }]), null);
});

test("expired owned records retain the expired selection in their appeal link", () => {
  assert.match(ownedPunishmentAppealLink(publicRecord, [{ ...candidate, active: false }]), /includeExpired=1/);
});

test("legacy links require both native eligibility and a binding belonging to a linked account", async () => {
  const fetchOwned = name => loadOwnedPunishmentAppeals(async path => {
    if (path.includes("auth/session")) return response({ authenticated: true, linkedMinecraftAccounts: [account], linkedPunishmentAppeals: false });
    if (path.includes("bindings")) return response({ bindings: [{ punishmentId: candidate.id, caseId: candidate.caseId, punishmentType: "NETWORK_BAN", boundUsername: name }] });
    return response({ punishments: [candidate] });
  });
  assert.ok(ownedPunishmentAppealLink(publicRecord, await fetchOwned(account.name)));
  assert.equal(ownedPunishmentAppealLink(publicRecord, await fetchOwned("OtherPlayer")), null);
});
