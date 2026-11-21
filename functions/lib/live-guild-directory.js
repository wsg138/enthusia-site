// Optional authenticated producer. Never forward browser credentials or follow redirects.
export function directoryHeaders(env){
  const headers={Accept:'application/json',Authorization:'Bearer '+env.GUILDS_API_BEARER};
  if(env.CF_ACCESS_CLIENT_ID&&env.CF_ACCESS_CLIENT_SECRET){headers['CF-Access-Client-Id']=env.CF_ACCESS_CLIENT_ID;headers['CF-Access-Client-Secret']=env.CF_ACCESS_CLIENT_SECRET;}
  return headers;
}
function directoryRequest(env) {
  if (!env.GUILDS_DIRECTORY_API_URL || !env.GUILDS_API_BEARER) return null;
  try {
    const url=new URL(env.GUILDS_DIRECTORY_API_URL);
    if(url.protocol!=='https:'||url.username||url.password)return null;
    return {url,headers:directoryHeaders(env)};
  } catch {return null;}
}
function validDirectoryTimestamp(data){
  const stamp=Date.parse(data.generatedAt);
  return Number.isFinite(stamp)&&stamp<=Date.now()+300000&&/^[0-9a-f]{64}$/.test(data.directoryRevision);
}
function validDirectoryShape(data,state){
  return Number.isInteger(data.total)&&data.total>=0&&data.total<=1000&&data.offset===state.offset&&Array.isArray(data.entries)&&data.entries.length<=50;
}
function validDirectorySequence(data,state){
  return state.revision===null||(state.revision===data.directoryRevision&&state.total===data.total&&state.generatedAt===data.generatedAt);
}
function validDirectoryPage(data,state){
  return validDirectoryTimestamp(data)&&validDirectoryShape(data,state)&&validDirectorySequence(data,state);
}
function collectDirectoryEntries(data,state){
  for(const entry of data.entries){
    if(!entry||typeof entry.id!=='string')return false;
    const id=entry.id.toLowerCase();
    if(state.ids.has(id))return false;
    state.ids.add(id);state.entries.push(entry);
  }
  return true;
}
function acceptDirectoryPage(data,state){
  if(!validDirectoryPage(data,state)||!collectDirectoryEntries(data,state))return 'invalid';
  state.revision=data.directoryRevision;state.total=data.total;state.generatedAt=data.generatedAt;
  const expected=state.offset+data.entries.length;
  if(data.nextOffset==null)return expected===state.total?'complete':'invalid';
  if(data.entries.length===0||data.nextOffset!==expected||expected>=state.total)return 'invalid';
  state.offset=expected;return 'next';
}
async function fetchDirectoryPage(request,fetchImpl){
  const response=await fetchImpl(request.url.toString(),{headers:request.headers,redirect:'error',signal:globalThis.AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('directory_unavailable');
  return response.json();
}
export async function readLiveGuildDirectory(env,fetchImpl=fetch){
  const request=directoryRequest(env);if(!request)return null;
  const state={entries:[],ids:new Set(),offset:0,revision:null,total:null,generatedAt:null};
  try {
    for(let page=0;page<20;page++){
      request.url.searchParams.set('offset',String(state.offset));request.url.searchParams.set('limit','50');
      if(state.revision!==null)request.url.searchParams.set('revision',state.revision);
      const status=acceptDirectoryPage(await fetchDirectoryPage(request,fetchImpl),state);
      if(status==='invalid')return null;
      if(status==='complete')return {entries:state.entries,generatedAt:state.generatedAt};
    }
  } catch {return null;}
  return null;
}
function validPlayerBoard(data){
  const stamp=Date.parse(data.generatedAt);
  return Number.isFinite(stamp)&&stamp<=Date.now()+300000&&Date.now()-stamp<=900000&&Array.isArray(data.players)&&data.players.length<=1000;
}
function validPublicPlayer(player){
  return typeof player?.uuid==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(player.uuid)&&typeof player.username==='string'&&/^[A-Za-z0-9_]{3,16}$/.test(player.username);
}
export async function readPublicLeaderboardPlayers(fetchImpl=fetch){
  try {
    const response=await fetchImpl('https://enthusia.info/api/leaderboards/playtime-active-all',{
      headers:{Accept:'application/json'},redirect:'error',signal:globalThis.AbortSignal.timeout(3000)
    });
    if(!response.ok)return [];
    const data=await response.json();
    if(!validPlayerBoard(data))return [];
    return data.players.filter(validPublicPlayer).map(player=>({id:player.uuid,name:player.username}));
  } catch {return [];}
}

// Only resolve names already present in the website's public player snapshot.
// An incomplete or malformed roster remains unavailable instead of looking complete.
export function resolvePublicGuildMembers(directory, players) {
  const known=new Map(), conflicts=new Set();
  for (const player of players) {
    if (typeof player?.id==='string' && typeof player.name==='string' && player.name.trim()) {
      const key=player.id.toLowerCase();
      if (known.has(key) && known.get(key)!==player.name) conflicts.add(key);
      known.set(key,player.name);
    }
  }
  return {...directory,entries:directory.entries.map(entry=>{
    if (!Array.isArray(entry.memberUuids) || entry.memberUuids.length>200 ||
        entry.memberUuids.length!==entry.memberCount ||
        entry.memberUuids.some(id=>typeof id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) return entry;
    const ids=entry.memberUuids.map(id=>id.toLowerCase());
    if (new Set(ids).size!==ids.length || ids.some(id=>!known.has(id) || conflicts.has(id))) return entry;
    return {...entry,membersList:ids.map(id=>known.get(id))};
  })};
}
