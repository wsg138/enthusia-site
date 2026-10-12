// Shared public projection. Counts stay decimal strings to preserve Kotlin Long precision.
const actions=['KILL_PLAYERS','KILL_MOBS','HARVEST_CROPS','MINE_BLOCKS','PLACE_BLOCKS','CRAFT_ITEMS','SMELT_ITEMS','FISH','ENCHANT_ITEMS','DEPOSIT_BANK','WIN_WARS'];
export const questTiers=['COMMON','CHALLENGING','HEADLINE','CONDITIONED'];
function fail(){throw new Error('invalid_guildquests');}
function text(v,max=200){if(typeof v!=='string'||!v.trim()||v.length>max)fail();return v.trim();}
function id(v){v=text(v,80);if(!/^[A-Za-z0-9_.:-]+$/.test(v))fail();return v;}
function date(v){if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))fail();return new Date(v).toISOString();}
function integer(v,max=2147483647){if(!Number.isSafeInteger(v)||v<0||v>max)fail();return v;}
function list(v,max){if(!Array.isArray(v)||v.length>max)fail();return v;}
function unique(values){if(new Set(values).size!==values.length)fail();}
function banner(v){if(!v)return null;const colors=['WHITE','ORANGE','MAGENTA','LIGHT_BLUE','YELLOW','LIME','PINK','GRAY','LIGHT_GRAY','CYAN','PURPLE','BLUE','BROWN','GREEN','RED','BLACK'];if(!colors.includes(v.baseColor))fail();return {baseColor:v.baseColor,patterns:list(v.patterns??[],20).map(p=>{if(!colors.includes(p.color)||typeof p.type!=='string'||! /^[A-Z_]{1,40}$/.test(p.type))fail();return {color:p.color,type:p.type};})};}
export function questCount(v){if(typeof v==='number'){if(!Number.isSafeInteger(v)||v<0)fail();v=String(v);}if(typeof v!=='string'||! /^(0|[1-9][0-9]{0,18})$/.test(v)||BigInt(v)>9223372036854775807n)fail();return v;}
export function progressPercent(count,target){const goal=BigInt(target);return goal===0n?0:Number((BigInt(count)>goal?goal:BigInt(count))*100n/goal);}
export function projectGuildQuests(input,now=Date.now()){
  if(input?.schemaVersion!==1||input.kind!=='guildquests')fail();
  const generatedAt=date(input.generatedAt);if(Date.parse(generatedAt)>now+60000)fail();
  let rows=0;
  const items=list(input.items,8).map(week=>{
    const startsAt=date(week.startsAt),endsAt=date(week.endsAt);if(Date.parse(endsAt)<=Date.parse(startsAt))fail();
    const guilds=list(week.guilds,200).map(g=>({id:id(g.id),name:text(g.name,80),banner:banner(g.banner)}));unique(guilds.map(g=>g.id));
    const guildIds=new Set(guilds.map(g=>g.id));
    const quests=list(week.quests,30).map(q=>{
      if(!actions.includes(q.action)||!questTiers.includes(q.tier)||typeof q.leaderboard!=='boolean')fail();
      const targetCount=questCount(q.targetCount);if(targetCount==='0')fail();
      const standings=list(q.standings,200).map((s,index)=>{
        if(!guildIds.has(s.guildId)||s.rank!==index+1||typeof s.claimed!=='boolean'||typeof s.rewardDelivered!=='boolean')fail();
        const count=questCount(s.count);if(s.claimed&&BigInt(count)<BigInt(targetCount)||s.rewardDelivered&&!s.claimed)fail();
        return {guildId:s.guildId,rank:s.rank,count,claimed:s.claimed,rewardDelivered:s.rewardDelivered};
      });unique(standings.map(s=>s.guildId));rows+=standings.length;if(rows>2000)fail();
      // Match the repository's score DESC, guild UUID ASC ordering, including ties.
      for(let i=1;i<standings.length;i++){const a=standings[i-1],b=standings[i];if(BigInt(a.count)<BigInt(b.count)||a.count===b.count&&a.guildId>b.guildId)fail();}
      const payouts=list(q.payouts,20).map(p=>({rank:integer(p.rank,200),experience:integer(p.experience)}));if(payouts.some(p=>p.rank===0))fail();unique(payouts.map(p=>p.rank));
      const icon=text(q.icon,80);if(!/^[a-z0-9_]+$/.test(icon))fail();
      return {id:id(q.id),name:text(q.name,160),description:text(q.description,800),action:q.action,tier:q.tier,icon,targetCount,experienceReward:integer(q.experienceReward),conditions:list(q.conditions,10).map(c=>text(c,200)),provenance:['NATURAL_ONLY','PLAYER_PLACED','ANY'].includes(q.provenance)?q.provenance:fail(),itemRewards:list(q.itemRewards,12).map(r=>({item:id(r.item),name:text(r.name,80),amount:integer(r.amount)})),leaderboard:q.leaderboard,payouts,standings};
    });unique(quests.map(q=>q.id));
    return {id:id(week.id),startsAt,endsAt,fullSetBonusExperience:integer(week.fullSetBonusExperience),guilds,quests};
  });unique(items.map(w=>w.id));
  const currentWeekId=input.currentWeekId===null?null:id(input.currentWeekId);if(currentWeekId&&!items.some(w=>w.id===currentWeekId))fail();
  return {kind:'guildquests',schemaVersion:1,generatedAt,currentWeekId,items};
}
