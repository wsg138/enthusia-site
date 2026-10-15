const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CASE = /^[0-9A-HJKMNP-TV-Z]{16}$/i;
const type = value => ({ NETWORK_BAN: "BAN", NETWORK_IDENTITY_BAN: "IP_BAN", PUBLIC_MUTE: "MUTE", WARN: "WARNING" }[value] || value);

async function privateGet(request, path) {
  const response = await request(path, { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("Punishment ownership unavailable");
  return response.json();
}

export async function loadOwnedPunishmentAppeals(request = fetch) {
  try {
    const session = await privateGet(request, "/api/competitions/auth/session");
    const accounts = session.linkedMinecraftAccounts || [];
    if (!session.authenticated || !accounts.length) return [];
    if (session.linkedPunishmentAppeals) {
      const owned = [];
      let cursor = null;
      for (let page = 0; page < 10; page++) {
        const query = new URLSearchParams({ scope: "ALL" });
        if (cursor) query.set("cursor", cursor);
        const response = await privateGet(request, `/api/appeals/punishments?${query}`);
        if (!Array.isArray(response.punishments)) throw new Error("Invalid ownership list");
        owned.push(...response.punishments.filter(item => accounts.some(account => account.uuid === item.minecraftUuid)));
        cursor = response.nextCursor;
        if (!cursor) break;
        if (!/^[A-Za-z0-9_-]{1,256}$/.test(cursor)) throw new Error("Invalid ownership cursor");
      }
      return owned;
    }
    const [bindings, eligible] = await Promise.all([
      privateGet(request, "/api/appeals/bindings"),
      privateGet(request, `/api/appeals/eligible?minecraftUuid=${encodeURIComponent(accounts[0].uuid)}`)
    ]);
    return (eligible.punishments || []).flatMap(item => {
      const binding = (bindings.bindings || []).find(row => row.punishmentId === item.id && row.caseId === item.caseId && type(row.punishmentType) === type(item.type));
      const account = binding && accounts.find(row => row.name.toLowerCase() === binding.boundUsername.toLowerCase());
      return account ? [{ ...item, minecraftUuid: account.uuid, minecraftName: account.name, active: true, appealable: true }] : [];
    });
  } catch { return []; }
}

export function ownedPunishmentAppealLink(item, owned) {
  const record = owned.find(row => row.appealable === true
    && UUID.test(row.id) && UUID.test(row.minecraftUuid) && CASE.test(row.caseId)
    && row.caseId === item.caseId && type(row.type) === type(item.punishmentType)
    && row.minecraftName?.toLowerCase() === item.player?.toLowerCase()
    && Number.isFinite(Date.parse(row.createdAt)) && Date.parse(row.createdAt) === Date.parse(item.issuedAt));
  if (!record) return null;
  const query = new URLSearchParams({ minecraftUuid: record.minecraftUuid, punishmentId: record.id });
  if (record.active === false) query.set("includeExpired", "1");
  return `/appeal.html?${query}#new`;
}
