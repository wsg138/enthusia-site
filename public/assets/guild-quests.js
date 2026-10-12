import { api,el,button } from './community-dom.js';
import { projectGuildQuests,progressPercent,questTiers } from './guild-quests-model.js';
const one=id=>document.getElementById(id),preview=document.documentElement.hasAttribute('data-preview-root');
const format=v=>BigInt(v).toLocaleString(),title=v=>v[0]+v.slice(1).toLowerCase(),date=v=>new Date(v).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
const assets=new URL('./market/',import.meta.url);
let data,week,selected,interval;
function icon(material){const manifest=window.ENTHUSIA_MINECRAFT_ASSETS,definition=manifest.materials[String(material).replace(/^minecraft:/,'').toUpperCase()]??manifest.fallback;return el('span',{class:'slot quest-icon','aria-hidden':'true'},definition.layers.map(layer=>el('img',{src:new URL(layer.src,assets).href,alt:''})));}
function message(value){one('quest-status').textContent=value;}
function banner(guild){const renderer=window.EnthusiaGuildBannerRenderer;return el('span',{class:'bn'},[guild.banner?renderer.create(guild.banner,guild.name+' banner'):renderer.createPlaceholder(guild.name)]);}
function rewards(q){return el('div',{class:'quest-rewards'},[el('span',{text:format(q.experienceReward)+' guild XP'}),...q.itemRewards.map(r=>el('span',{class:'quest-reward-item'},[icon(r.item),el('span',{text:format(r.amount)+' × '+r.name})]))]);}
function progress(q,guildId){const row=q.standings.find(s=>s.guildId===guildId);if(!row)return el('p',{text:'Progress for this guild is not included in the public feed.'});return el('div',{},[el('p',{text:format(row.count)+' / '+format(q.targetCount)+' · '+(row.rewardDelivered?'Reward delivered':row.claimed?'Reward delivery pending':BigInt(row.count)>=BigInt(q.targetCount)?'Target reached':'In progress')}),el('div',{class:'quest-progress',role:'progressbar','aria-valuenow':progressPercent(row.count,q.targetCount),'aria-valuemin':0,'aria-valuemax':100,'aria-label':q.name+' progress'},[el('span',{style:'width:'+progressPercent(row.count,q.targetCount)+'%'})])]);}
function drawBoard(){
  const q=week.quests.find(q=>q.id===selected),board=one('quest-board');board.replaceChildren();if(!q){board.append(el('p',{text:'Select a quest to view its standings.'}));return;}
  const guildId=one('quest-guild').value;
  board.append(el('p',{class:'quest-kicker',text:q.leaderboard?'Featured competition':'Quest standings'}),el('h2',{text:q.name}),el('p',{text:'Scores keep counting beyond the objective. Ties follow the server’s guild ID order.'}));
  if(q.payouts.length)board.append(el('p',{text:'Weekly placement rewards: '+q.payouts.map(p=>'#'+p.rank+' · '+format(p.experience)+' XP').join(' / ')}));
  const standings=el('ol',{class:'quest-ranks','aria-label':q.name+' leaderboard'});
  for(const row of q.standings){const guild=week.guilds.find(g=>g.id===row.guildId);standings.append(el('li',{class:'quest-rank'+(guildId===guild.id?' selected':'')},[el('span',{text:'#'+row.rank}),banner(guild),el('div',{},[el('p',{class:'quest-rank-name',text:guild.name}),el('p',{class:'quest-rank-score',text:format(row.count)+' contributed'}),el('div',{class:'quest-progress','aria-hidden':'true'},[el('span',{style:'width:'+progressPercent(row.count,q.targetCount)+'%'})])])]));}
  board.append(standings);if(!q.standings.length)board.append(el('p',{text:'No guild standings have been published for this quest yet.'}));
  board.append(el('p',{text:'Only exported standings are shown; a missing guild is not a zero score.'}));
}
function draw(){
  const query=one('quest-search').value.trim().toLowerCase(),tier=one('quest-tier').value,guildId=one('quest-guild').value;
  const quests=week.quests.filter(q=>(!tier||q.tier===tier)&&(!query||(q.name+' '+q.description+' '+q.conditions.join(' ')).toLowerCase().includes(query)));
  if(!quests.some(q=>q.id===selected))selected=quests.find(q=>q.leaderboard)?.id??quests[0]?.id;
  const catalog=one('quest-catalog');catalog.replaceChildren();one('quest-results').textContent=quests.length+' of '+week.quests.length+' quests';
  for(const q of quests){const card=el('article',{class:'panel quest-card','aria-current':q.id===selected?'true':'false'},[el('div',{class:'quest-heading'},[icon(q.icon),el('div',{},[el('span',{class:'quest-badge',text:title(q.tier)+(q.leaderboard?' · Featured':'')}),el('h2',{text:q.name})])]),el('p',{text:q.description}),el('p',{text:'Objective: '+format(q.targetCount)+' · '+(q.provenance==='NATURAL_ONLY'?'Naturally generated blocks only':q.provenance==='PLAYER_PLACED'?'Player-placed blocks only':'Standard server quest rules')}),rewards(q)]);
    if(q.conditions.length)card.append(el('ul',{class:'quest-conditions'},q.conditions.map(c=>el('li',{text:c}))));
    if(guildId)card.append(progress(q,guildId));card.append(button('View standings',()=>{selected=q.id;draw();one('quest-board').focus();},'btn '+(q.id===selected?'btn-gold':'btn-dark')));catalog.append(card);
  }
  if(!quests.length)catalog.append(el('p',{class:'quest-status',text:week.quests.length?'No quests match these filters.':'No quests have been published for this week.'}));drawBoard();
}
function tick(){if(!week)return;const now=Date.now(),end=Date.parse(week.endsAt),start=Date.parse(week.startsAt);one('quest-clock').textContent=now<start?'Starts '+new Date(start).toLocaleString():now>=end?'Week ended · awaiting the next rotation':'Resets in '+Math.floor((end-now)/86400000)+'d '+Math.floor((end-now)%86400000/3600000)+'h '+Math.floor((end-now)%3600000/60000)+'m';if(now>=end&&week.id!==data.currentWeekId)one('quest-clock').textContent='Archived week';}
function chooseWeek(){week=data.items.find(w=>w.id===one('quest-week').value);selected=null;one('quest-guild').replaceChildren(el('option',{value:'',text:'All guilds'}),...week.guilds.map(g=>el('option',{value:g.id,text:g.name})));one('quest-bonus').textContent='Full set bonus: '+format(week.fullSetBonusExperience)+' guild XP';draw();tick();}
async function load(){
  one('quest-retry').disabled=true;clearInterval(interval);one('quest-controls').hidden=true;message('Loading weekly guild quests…');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try{const raw=await api('guildquests',{signal:controller.signal});data=projectGuildQuests(raw);one('quest-updated').textContent='Updated '+new Date(data.generatedAt).toLocaleString();message((preview?'Design preview · illustrative quests, guild scores and rewards. ':'')+(raw.stale||Date.now()-Date.parse(data.generatedAt)>900000?'The last snapshot is over 15 minutes old. Scores may have changed. ':'')+(data.currentWeekId===null?'No active quest rotation has been published.':''));
    if(!data.items.length){one('quest-catalog').replaceChildren();one('quest-board').replaceChildren();message('No quest weeks have been published yet.');return;}
    one('quest-week').replaceChildren(...[...data.items].sort((a,b)=>Date.parse(b.startsAt)-Date.parse(a.startsAt)).map(w=>el('option',{value:w.id,text:(w.id===data.currentWeekId?'Current · ':'Archive · ')+date(w.startsAt)+' – '+date(w.endsAt)})));one('quest-week').value=data.currentWeekId??one('quest-week').value;one('quest-controls').hidden=false;chooseWeek();interval=setInterval(tick,30000);
  }catch{data=null;week=null;one('quest-catalog').replaceChildren();one('quest-board').replaceChildren(el('p',{text:'Standings will appear when the server quest feed is connected.'}));one('quest-clock').textContent='Quest feed unavailable';one('quest-updated').textContent='';one('quest-bonus').textContent='';message('Weekly quests are not available from the server yet. Check guild quests in-game or try again later.');}
  finally{clearTimeout(timeout);one('quest-retry').disabled=false;}
}
one('quest-tier').append(...questTiers.map(t=>el('option',{value:t,text:title(t)})));
one('quest-week').addEventListener('change',chooseWeek);for(const id of ['quest-search','quest-tier','quest-guild'])one(id).addEventListener(id==='quest-search'?'input':'change',draw);one('quest-retry').addEventListener('click',load);load();
