import { Validator } from '@cfworker/json-schema';
import schema from './prestige-schema.js';
import { directoryHeaders } from './live-guild-directory.js';

const validator = new Validator(schema, '2020-12');
const numerals = ['I','II','III','IV','V','VI'];

export function projectPrestige(snapshot) {
  if (!validator.validate(snapshot).valid) throw new Error('invalid_prestige');
  const ids = new Set();
  for (const [index,guild] of snapshot.guilds.entries()) {
    if (ids.has(guild.id) || guild.hallRank !== index+1) throw new Error('invalid_prestige_rank');
    ids.add(guild.id);
    let previous = 0;
    for (const entry of guild.history) {
      if (entry.tier <= previous || entry.tier > guild.tier || entry.creditedTotal < entry.credited.length)
        throw new Error('invalid_prestige_history');
      previous = entry.tier;
    }
  }
  if (!snapshot.tiers.every((t,i)=>t.tier===i+1 && t.roman===numerals[i])) throw new Error('invalid_prestige_tiers');
  return {...snapshot,generatedAt:new Date(snapshot.generatedAt).toISOString()};
}

function validSnapshot(raw, now) {
  try {
    const data = projectPrestige(raw);
    return Date.parse(data.generatedAt) <= now+300000 ? data : null;
  } catch { return null; }
}

async function fetchPrestige(env, fetchImpl) {
  if (!env.GUILDS_PRESTIGE_API_URL || !env.GUILDS_API_BEARER?.trim()) return null;
  try {
    const url = new URL(env.GUILDS_PRESTIGE_API_URL);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const response = await fetchImpl(url,{headers:directoryHeaders(env),redirect:'error',signal:globalThis.AbortSignal.timeout(5000)});
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

export async function readPrestige(env, stored, fetchImpl=fetch, now=Date.now()) {
  const live = validSnapshot(await fetchPrestige(env,fetchImpl), now);
  const cached = validSnapshot(stored,now);
  const best = live && (!cached || live.generatedAt >= cached.generatedAt) ? live : cached;
  return best ? {...best,stale:now-Date.parse(best.generatedAt)>900000} : null;
}
