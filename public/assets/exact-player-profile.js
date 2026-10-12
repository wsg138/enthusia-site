import {el,link} from './community-dom.js';
import {ownedPlayerStalls} from './player-market-model.js';
let marketSnapshot;
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
  if(item.previewExample)node.append(el('p',{text:'Simulated guild layout example. This is not a real player or membership.'}));
  const values=[['Balance',item.balance],['Active playtime',item.playtime===null||item.playtime===undefined?null:
    item.playtime.toLocaleString('en-US',{maximumFractionDigits:1})+' hours'],
    ['Balance leaderboard',item.balanceRank?'#'+item.balanceRank:null],['Playtime leaderboard',item.playtimeRank?'#'+item.playtimeRank:null]];
  const available=values.filter(([,value])=>value!==null&&value!==undefined);
  node.append(el('div',{class:'stats',style:'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:16px'},
    available.map(([label,value])=>el('div',{class:'stat',style:'padding:16px;display:flex;flex-direction:column;gap:8px;min-width:0'},[
      el('b',{text:typeof value==='number'?value.toLocaleString('en-US'):value,style:'font-size:24px;line-height:32px;overflow-wrap:anywhere'}),el('span',{text:label})]))));
  const market=section('At the market'),sections=el('div',{class:'player-profile-sections'},[guildSection(item),market]);
  node.append(sections);appendMarket(market,item,node);
  if(item.rank)node.append(el('p',{text:'Rank: '+item.rank}));
  if(item.achievements?.length)node.append(el('h3',{text:'Achievements'}),el('ul',{class:'plain'},item.achievements.map(name=>el('li',{text:name}))));
  market.append(link('market.html#owner='+encodeURIComponent(item.name),'Open market','btn btn-gold'));
  node.append(el('div',{class:'player-profile-links'},[link('leaderboards.html','Leaderboards','btn btn-dark'),link('guildquests.html','Guild quests','btn btn-dark')]));
  for(const entry of item.links??[])node.append(link(entry.url,entry.label,'btn btn-dark'));
}
