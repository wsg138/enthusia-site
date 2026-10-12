const contentKinds = new Set(['news', 'changelog', 'roadmap', 'timeline', 'halloffame',
  'creators', 'museum', 'achievements', 'polls']);
const publicKinds = new Set([...contentKinds, 'guilds', 'guildquests', 'players', 'bounties', 'warzone',
  'insights', 'alerts', 'market-design']);

function validSegments(segments) {
  if (segments.length === 1) return publicKinds.has(segments[0]);
  if (segments.length !== 2) return false;
  if (segments[0] === 'admin') return segments[1] === 'session' || contentKinds.has(segments[1]);
  return segments[0] === 'polls' && /^[A-Za-z0-9_.:-]{1,128}$/.test(segments[1])
    && !['.', '..'].includes(segments[1]);
}

function validQuery(query) {
  const params = new URLSearchParams(query);
  const seen = new Set();
  for (const [key, value] of params) {
    if (!['week', 'mode', 'item'].includes(key) || seen.has(key) || value.length > 128) return false;
    seen.add(key);
  }
  return true;
}

export function communityApiPath(path) {
  const fail = () => { throw new Error('Unsupported community API route'); };
  if (typeof path !== 'string' || path.length > 1024 || /[#\\\s]/.test(path)) return fail();
  const [pathname, query, extra] = path.split('?');
  if (extra !== undefined) return fail();
  let segments;
  try { segments = pathname.split('/').map(decodeURIComponent); }
  catch { return fail(); }
  if (!validSegments(segments)) return fail();
  if (query !== undefined && (pathname !== 'insights' || !validQuery(query))) return fail();
  const canonical = segments.map(encodeURIComponent).join('/');
  return '/api/community/' + canonical + (query === undefined ? '' : '?' + query);
}
