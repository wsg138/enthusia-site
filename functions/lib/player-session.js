import { authenticateRequest } from "./auth.js";
import { getCompetitionIdentitySession } from "./competitions/identity.js";

function discordPlayerSession(session) {
  const player = session?.linkedMinecraftAccounts?.[0];
  if (!player) throw new Error("Authenticated Discord account has no linked Minecraft account");
  return Object.freeze({
    subject: session.subject,
    email: null,
    player: Object.freeze({ uuid: player.uuid, name: player.name }),
    roles: Object.freeze([])
  });
}

export async function authenticatePlayerRequest(request, env) {
  try {
    return await authenticateRequest(request, env);
  } catch {
    const session = await getCompetitionIdentitySession(request, env?.COMPETITIONS_DB);
    return discordPlayerSession(session);
  }
}

export { discordPlayerSession };
