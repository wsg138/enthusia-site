import { projectSnapshot } from './community/contracts.js';
import {readPlayerGuildMemberships,readPlayerAchievements} from './community/upstream.js';
import {readLiveGuildDirectory} from './live-guild-directory.js';
import {projectGuildDirectory} from './guild-directory-source.js';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const NAME=/^[A-Za-z0-9_. -]{1,40}$/;
const metric=value=>Number.isFinite(value)&&value>=0&&value<=1e12?value:null;

async function board(bucket,key,now) {
  try {
    const object=await bucket?.get(key);
    if(!object || object.size>1500000)return null;
    const data=typeof object.json==='function'?await object.json():await new Response(object.body).json();
    if(!Array.isArray(data.players)||data.players.length>1000)return null;
    const date=Date.parse(data.generatedAt);
    if(!Number.isFinite(date)||date>now+60000)return null;
    return {...data,generatedAt:new Date(date).toISOString()};
  } catch { return null; }
}
function identity(row) {
  if(!UUID.test(row?.uuid)||!NAME.test(row?.username))return null;
  return {id:row.uuid.toLowerCase(),name:row.username};
}
function activeHours(row,unit) {
  const minutes=metric(row.stats?.activeMinutes??(unit==='minutes'?row.value:null));
  return minutes===null?null:minutes/60;
}
function mergeBoard(map,data,type) {
  const seen=new Set();
  for(const row of data?.players??[]) {
    const player=identity(row);
    if(!player||seen.has(player.id))continue;
    seen.add(player.id);
    const current=map.get(player.id)??{...player,playtime:null,balance:null};
    current[type]=type==='playtime'?activeHours(row,data.unit):metric(row.value);
    const position=row.rank;
    if(Number.isInteger(position)&&position>0&&position<=1e9)current[type==='playtime'?'playtimeRank':'balanceRank']=position;
    map.set(player.id,current);
  }
}
function validDirectoryCapture(directory,now){
  const time=Date.parse(directory?.generatedAt);
  return Number.isFinite(time)&&time<=now+60000&&now-time<=900000&&Array.isArray(directory.entries);
}
function rosterIds(entry){
  const ids=entry.memberUuids;
  if(!Array.isArray(ids)||ids.length!==entry.memberCount||ids.length>200)return null;
  if(ids.some(id=>typeof id!=='string'||!UUID.test(id)))return null;
  const unique=new Set(ids.map(id=>id.toLowerCase()));
  return unique.size===ids.length?unique:null;
}
function validGuildRoster(guild,ids,seen){return Boolean(guild&&ids&&!seen.has(guild.id));}
function directoryAssociations(directory){
  const projected=projectGuildDirectory(directory).items;
  if(projected.length!==directory.entries.length)return null;
  const seen=new Set(),associations=new Map();
  for(let i=0;i<directory.entries.length;i++){
    const guild=projected[i],ids=rosterIds(directory.entries[i]);
    if(!validGuildRoster(guild,ids,seen))return null;
    seen.add(guild.id);
    for(const id of ids){
      if(!associations.has(id))associations.set(id,[]);
      associations.get(id).push({id:guild.id,name:guild.name,level:guild.level,banner:guild.banner});
    }
  }
  return [...associations.values()].some(guilds=>guilds.length>20)?null:associations;
}
function associateDirectory(players,directory,now){
  if(!validDirectoryCapture(directory,now))return false;
  try {
    const associations=directoryAssociations(directory);if(!associations)return false;
    for(const [id,player] of players)Object.assign(player,{guildsKnown:true,guildMemberships:associations.get(id)??[]});
    return true;
  } catch {return false;}
}
function directoryConfigured(env){return Boolean(env.GUILDS_DIRECTORY_API_URL&&env.GUILDS_API_BEARER);}
export async function enrichStoredPlayerGuilds(snapshot,env,now=Date.now(),fetchImpl=fetch) {
  if(!directoryConfigured(env)||!Array.isArray(snapshot.items))return snapshot;
  const directory=await readLiveGuildDirectory(env,fetchImpl);
  const players=new Map(snapshot.items.filter(player=>UUID.test(player.id)).map(player=>[player.id.toLowerCase(),{...player}]));
  if(!associateDirectory(players,directory,now))return snapshot;
  const sourceUpdatedAt=snapshot.sourceUpdatedAt??snapshot.generatedAt??snapshot.updatedAt;
  return {...snapshot,items:snapshot.items.map(player=>players.get(String(player.id).toLowerCase())??player),
    sourceUpdatedAt,generatedAt:[snapshot.generatedAt,directory.generatedAt].filter(Boolean).sort().at(-1)};
}
export async function enrichPlayerAchievements(snapshot,env,now=Date.now(),fetchImpl=fetch) {
  if(!env.COMMUNITY_PLAYER_ACHIEVEMENTS_API_URL||!Array.isArray(snapshot.items))return snapshot;
  const players=new Map(snapshot.items.filter(player=>UUID.test(player.id))
    .map(player=>[player.id.toLowerCase(),{...player}]));
  const ids=[...players.keys()].filter(id=>players.get(id).achievementsKnown!==true).slice(0,1000);
  let changed=false;
  for(let offset=0;offset<ids.length;offset+=100){
    const results=await Promise.all([ids.slice(offset,offset+50),ids.slice(offset+50,offset+100)]
      .filter(batch=>batch.length).map(batch=>readPlayerAchievements(batch,env,fetchImpl,now)));
    for(const result of results.filter(Boolean))for(const row of result.items){
      Object.assign(players.get(row.id),{achievementsKnown:true,achievements:row.achievements});changed=true;
    }
  }
  return changed?{...snapshot,items:snapshot.items.map(player=>players.get(String(player.id).toLowerCase())??player)}:snapshot;
}
export async function readPublicPlayerDirectory(env,now=Date.now(),fetchImpl=fetch) {
  const [playtime,balance]=await Promise.all([
    board(env.PLAYTIME_LEADERBOARDS,'leaderboards/playtime-active-all.json',now),
    board(env.BALANCE_LEADERBOARDS,'leaderboards/balance-active-all.json',now)
  ]);
  if(!playtime&&!balance)return null;
  const players=new Map();mergeBoard(players,playtime,'playtime');mergeBoard(players,balance,'balance');
  if(!players.size)return null;
  const sources=[playtime,balance].filter(Boolean);
  if(env.COMMUNITY_PLAYER_GUILDS_API_URL){
    const ids=[...players.keys()].slice(0,1000),batches=[];
    for(let offset=0;offset<ids.length;offset+=50)batches.push(readPlayerGuildMemberships(ids.slice(offset,offset+50),env,fetchImpl,now));
    const results=await Promise.all(batches);
    for(const result of results.filter(Boolean)){
      sources.push(result);
      for(const row of result.items)Object.assign(players.get(row.id),{guildsKnown:true,guildMemberships:row.guildMemberships});
    }
  }
  if(env.COMMUNITY_PLAYER_ACHIEVEMENTS_API_URL){
    const ids=[...players.keys()].slice(0,1000);
    // Bound simultaneous bridge work; absent and failed rows stay unknown.
    for(let offset=0;offset<ids.length;offset+=100){
      const results=await Promise.all([ids.slice(offset,offset+50),ids.slice(offset+50,offset+100)]
        .filter(batch=>batch.length).map(batch=>readPlayerAchievements(batch,env,fetchImpl,now)));
      for(const result of results.filter(Boolean)){
        sources.push(result);
        for(const row of result.items)Object.assign(players.get(row.id),{achievementsKnown:true,achievements:row.achievements});
      }
    }
  }
  if (env.GUILDS_DIRECTORY_API_URL && env.GUILDS_API_BEARER) {
    const directory=await readLiveGuildDirectory(env,fetchImpl);
    if(associateDirectory(players,directory,now))sources.push(directory);
  }
  const updatedAt=sources.map(source=>source.generatedAt).sort()[0];
  return {...projectSnapshot('players',{items:[...players.values()].slice(0,1000)}),
    generatedAt:sources.map(source=>source.generatedAt).sort().at(-1),sourceUpdatedAt:updatedAt,
    updatedAt,stale:now-Date.parse(updatedAt)>900000,limited:true,source:'public_leaderboards',
    coverage:{playtime:playtime?.players.length??null,balance:balance?.players.length??null}};
}
