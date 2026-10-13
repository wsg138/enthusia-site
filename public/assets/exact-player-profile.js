import {el,link,api} from './community-dom.js';
import {ownedPlayerStalls} from './player-market-model.js';
import {profileGuildQuests,profileBounties,profileDuelWins} from './player-activity-model.js';
let marketSnapshot;
const profileFeeds=new Map();
function feed(kind){if(!profileFeeds.has(kind))profileFeeds.set(kind,api(kind,{signal:AbortSignal.timeout(5000)}).catch(()=>{profileFeeds.delete(kind);return null;}));return profileFeeds.get(kind);}
async function appendActivity(host,item,node,kind){
  const message=el('p',{text:'Loading…',role:'status'});host.append(message);
  const snapshot=await (kind==='warzone'&&item.weeklyDuelWins?null:feed(kind));if(!node.isConnected)return;
  if(kind==='guildquests'){
    const result=profileGuildQuests(item,snapshot);
    message.textContent=!result?'Guild quest progress is unavailable.':result.inactive?'No active quest week in this export.':result.quests.length?'Progress for your guilds':'No progress records for your guilds in this export.';
    for(const quest of result?.quests.slice(0,6)??[])host.append(el('div',{class:'player-activity-row'},[
      el('b',{text:quest.name}),el('p',{text:quest.guildName+' · '+quest.count+' / '+quest.target+(quest.rank?' · #'+quest.rank:'')+(quest.claimed?' · Claimed':'')}),
      el('progress',{value:quest.percent,max:100,'aria-label':quest.name+' guild progress'})]));
    if(result?.partial)host.append(el('small',{text:'Partial guild progress export.'}));
  }else if(kind==='bounties'){
    const rows=profileBounties(item,snapshot);
    message.textContent=rows===null?'Bounty data is unavailable.':rows.length?rows.length+' open '+(rows.length===1?'bounty':'bounties')+' on this player':'No open bounty listed in this export.';
    for(const row of rows??[])host.append(el('div',{class:'player-activity-row'},[el('b',{text:row.gold===null||row.gold===undefined?'Payout details unavailable':row.gold.toLocaleString('en-US')+' raw gold'}),row.expiresAt?el('p',{text:'Expires '+new Date(row.expiresAt).toLocaleDateString('en-US')}):null]));
  }else{
    const result=profileDuelWins(item,snapshot);
    message.textContent=!result?'Weekly duel results are unavailable.':result.listed===false?'Not listed in the published weekly leaders. Full player totals are unavailable.':result.wins+' '+(result.wins===1?'match win':'match wins');
    if(result?.weekStartsAt)host.append(el('small',{text:'Week of '+new Date(result.weekStartsAt).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})+' · UTC'}));
    if(result?.capturedAt)host.append(el('small',{text:'Captured '+new Date(result.capturedAt).toLocaleString('en-US')}));
    if(result?.stale)host.append(el('small',{text:'Captured duel results may be stale.'}));
  }
  const stamp=Date.parse(snapshot?.generatedAt??snapshot?.updatedAt);
  if(snapshot&&(snapshot.stale||!Number.isFinite(stamp)||Date.now()-stamp>900000))host.append(el('small',{text:'This feed may be stale.'}));
  if(kind==='bounties'&&snapshot?.limited)host.append(el('small',{text:'Partial public bounty export.'}));
}
function section(title){return el('section',{class:'player-profile-section'},[el('h4',{text:title})]);}
function guildSection(item){
  const host=section('Guilds');
  const guilds=item.guildMemberships??[];
  for(const guild of guilds){
    const row=el('div',{class:'player-guild-row'}),renderer=window.EnthusiaGuildBannerRenderer;
    if(renderer)row.append(guild.banner?renderer.create(guild.banner,guild.name+' banner'):renderer.createPlaceholder(guild.name));
    row.append(el('div',{},[link('guilds.html#'+encodeURIComponent(guild.id),guild.name,'player-guild-name'),
      guild.level!==null&&guild.level!==undefined?el('p',{text:'Level '+guild.level}):null]));host.append(row);
  }
  if(item.guildsPartial)host.append(el('small',{text:'Confirmed by the public guild leaderboard. Other memberships may not be included.'}));
  if(guilds.some(guild=>!guild.banner))host.append(el('small',{text:'Some guild banner designs are not published in the available feeds.'}));
  if(!guilds.length)host.append(el('p',{text:item.guild?item.guild:item.guildsKnown?'No guild memberships in the latest export.':'Guild membership is not available in this export.'}));
  host.append(link('guilds.html','Browse guilds','btn btn-dark'));
  return host;
}
async function appendMarket(host,item,node){
  const message=el('p',{text:'Loading owned stalls…',role:'status'});host.append(message);
  try{
    marketSnapshot??=fetch('https://market-api.enthusia.info/v1/market',{redirect:'error'}).then(async response=>{
      if(!response.ok)throw new Error('market_unavailable');return response.json();
    });
    const snapshot=await marketSnapshot,stalls=ownedPlayerStalls(snapshot,item);
    if(!node.isConnected)return;
    message.textContent=stalls.length?stalls.length+' owned '+(stalls.length===1?'stall':'stalls')+' · '+stalls.reduce((n,s)=>n+s.shops,0)+' shops':'No owned stalls in the public market export.';
    for(const stall of stalls.slice(0,5))host.append(link('market.html#stall='+encodeURIComponent(stall.id),
      stall.id+' · '+stall.shops+' shops'+(stall.types.length?' · '+stall.types.join(' / '):''),'player-stall-link'));
    const captured=Date.parse(snapshot.generatedAt??snapshot.updatedAt);
    if(!Number.isFinite(captured)||Date.now()-captured>900000)host.append(el('small',{text:'Market export may be stale.'}));
  }catch{marketSnapshot=null;if(node.isConnected)message.textContent='Public market data is unavailable.';}
}
export function playerHead(item,size=64) {
  const identity=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(item.id)?item.id:item.name;
  const head=el('img',{src:item.previewExample?new URL('./market/player-head-base.svg',import.meta.url).href:'https://mc-heads.net/avatar/'+encodeURIComponent(identity)+'/'+size,
    alt:item.name+' Minecraft head',width:size,height:size,loading:'lazy',
    style:'image-rendering:pixelated;flex:none;max-width:100%'});
  head.addEventListener('error',()=>{head.src=new URL('./market/player-head-base.svg',import.meta.url).href;},{once:true});
  return head;
}
export function playerProfile(node,item) {
  const name=el('div',{},[el('p',{text:'PLAYER PROFILE'}),el('h3',{text:item.name,
    style:'font-size:36px;line-height:44px;overflow-wrap:anywhere'})]);
  node.replaceChildren(el('div',{style:'display:flex;gap:20px;align-items:center;flex-wrap:wrap'},[playerHead(item),name]));
  if(item.previewExample)node.append(el('p',{text:'Simulated profile layout. Guilds, quests, achievements, bounties and duel wins here are examples.'}));
  const values=[['Balance',item.balance],['Active playtime',item.playtime===null||item.playtime===undefined?null:
    item.playtime.toLocaleString('en-US',{maximumFractionDigits:1})+' hours'],
    ['Balance leaderboard',item.balanceRank?'#'+item.balanceRank:null],['Playtime leaderboard',item.playtimeRank?'#'+item.playtimeRank:null]];
  const available=values.filter(([,value])=>value!==null&&value!==undefined);
  node.append(el('div',{class:'stats',style:'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:16px'},
    available.map(([label,value])=>el('div',{class:'stat',style:'padding:16px;display:flex;flex-direction:column;gap:8px;min-width:0'},[
      el('b',{text:typeof value==='number'?value.toLocaleString('en-US'):value,style:'font-size:24px;line-height:32px;overflow-wrap:anywhere'}),el('span',{text:label})]))));
  const market=section('At the market'),sections=el('div',{class:'player-profile-sections'},[guildSection(item),market]);
  node.append(sections);appendMarket(market,item,node);
  for(const [title,kind,url]of [['Guild quests','guildquests','guildquests.html'],['Bounties','bounties','bounties.html'],['Weekly duel wins','warzone','index.html#warzone']]){
    const host=section(title);sections.append(host);appendActivity(host,item,node,kind).catch(()=>{if(node.isConnected)host.querySelector('[role="status"]').textContent='This data is unavailable.';});host.append(link(url,'View '+title.toLowerCase(),'btn btn-dark'));
  }
  const achievements=section('Achievements');sections.append(achievements);
  achievements.append(item.achievements?.length?el('ul',{class:'plain'},item.achievements.map(name=>el('li',{text:name}))):el('p',{text:item.achievementsKnown?'No completed achievements in this export.':'Personal achievement progress is unavailable.'}));
  achievements.append(link('achievements.html','Browse achievements','btn btn-dark'));
  if(item.rank)node.append(el('p',{text:'Rank: '+item.rank}));
  market.append(link('market.html#owner='+encodeURIComponent(item.name),'Open market','btn btn-gold'));
  node.append(el('div',{class:'player-profile-links'},[link('leaderboards.html','Leaderboards','btn btn-dark'),link('guildquests.html','Guild quests','btn btn-dark')]));
  for(const entry of item.links??[])node.append(link(entry.url,entry.label,'btn btn-dark'));
}
