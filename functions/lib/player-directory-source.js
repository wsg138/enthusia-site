import { projectSnapshot } from './community/contracts.js';
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
    map.set(player.id,current);
  }
}
export async function readPublicPlayerDirectory(env,now=Date.now()) {
  const [playtime,balance]=await Promise.all([
    board(env.PLAYTIME_LEADERBOARDS,'leaderboards/playtime-active-all.json',now),
    board(env.BALANCE_LEADERBOARDS,'leaderboards/balance-active-all.json',now)
  ]);
  if(!playtime&&!balance)return null;
  const players=new Map();mergeBoard(players,playtime,'playtime');mergeBoard(players,balance,'balance');
  if(!players.size)return null;
  const sources=[playtime,balance].filter(Boolean),updatedAt=sources.map(source=>source.generatedAt).sort()[0];
  return {...projectSnapshot('players',{items:[...players.values()].slice(0,1000)}),
    updatedAt,stale:now-Date.parse(updatedAt)>900000,limited:true,source:'public_leaderboards',
    coverage:{playtime:playtime?.players.length??null,balance:balance?.players.length??null}};
}
