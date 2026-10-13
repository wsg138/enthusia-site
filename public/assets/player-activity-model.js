import {progressPercent} from './guild-quests-model.js';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)?value.toLowerCase():null;
export function profileGuildQuests(player,snapshot,now=Date.now()){
  if(!snapshot||!Array.isArray(snapshot.items))return null;
  if(!player.guildsKnown)return null;
  const guilds=new Set((player.guildMemberships??[]).map(g=>g.id));
  const week=snapshot.items.find(w=>w.id===snapshot.currentWeekId);
  if(!week||Date.parse(week.startsAt)>now||Date.parse(week.endsAt)<=now)return {quests:[],inactive:true};
  const quests=[];
  for(const quest of week.quests??[])for(const row of quest.standings??[]){
    if(guilds.has(row.guildId))quests.push({id:quest.id,name:quest.name,guildId:row.guildId,
      guildName:player.guildMemberships.find(g=>g.id===row.guildId).name,
      count:row.count,target:quest.targetCount,percent:progressPercent(row.count,quest.targetCount),
      claimed:row.claimed,rank:quest.leaderboard?row.rank:null});
  }
  return {quests,inactive:false,partial:player.guildsPartial===true||snapshot.limited===true};
}
export function profileBounties(player,snapshot,now=Date.now()){
  if(!snapshot||!Array.isArray(snapshot.items)||!uuid(player.id))return null;
  return snapshot.items.filter(row=>uuid(row.id.replace(/^bounty-/,''))===uuid(player.id)&&row.state==='open'&&(!row.expiresAt||Date.parse(row.expiresAt)>now));
}
export function profileDuelWins(player,snapshot,now=Date.now()){
  const own=player.weeklyDuelWins;
  if(own)return {...own,complete:true,stale:now-Date.parse(own.capturedAt)>900000};
  if(!uuid(player.id))return null;
  if(!snapshot||!Array.isArray(snapshot.items))return null;
  const row=snapshot.items.find(row=>row.type==='leader'&&uuid(row.id.replace(/^duels-/,''))===uuid(player.id));
  if(!row)return {listed:false};
  const generated=Date.parse(snapshot.generatedAt??snapshot.updatedAt);
  if(!Number.isFinite(generated))return null;
  const date=new Date(generated);date.setUTCHours(0,0,0,0);date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));
  return {listed:true,wins:row.wins,weekStartsAt:snapshot.weekStartsAt??date.toISOString(),complete:false,
    stale:snapshot.stale===true||now-generated>900000};
}
