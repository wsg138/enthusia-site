import { api,el,link } from './community-dom.js';
import { notice,formattedDate } from './exact-markup.js';
const kind=document.body.dataset.exactDirectory,preview=document.documentElement.hasAttribute('data-preview-root');
const status=document.querySelector('[data-directory-status]');
const templates=new Map();for(const node of document.querySelectorAll('template[data-design-template]'))templates.set(node.dataset.designTemplate+':'+node.dataset.variant,node);
const one=(selector,root=document)=>root.querySelector(selector);
let items=[],selected=null,q='',filter=kind==='bounties'?'open':'all',sort=kind==='guilds'?'level':'gold';
let limited=false;
function guildBanner(item,large=false){const renderer=window.EnthusiaGuildBannerRenderer;const host=el('span',{class:large?'bn lg':'bn'});if(renderer){const image=item.banner?renderer.create(item.banner,item.name+' banner'):renderer.createPlaceholder(item.name);image.style.width='100%';image.style.height='100%';image.style.border='0';host.append(image);}return host;}
function guildProfile(node,item){
  node.setAttribute('aria-label',item.name+' guild profile');
  const value=v=>v===null||v===undefined?'Not available':typeof v==='number'?v.toLocaleString('en-US'):v;
  const heading=el('div',{style:'display:flex;gap:24px;flex-wrap:wrap;align-items:center'},[guildBanner(item,true),el('div',{},[el('p',{text:'GUILD PROFILE'}),el('h3',{text:item.name,style:'font-size:48px;line-height:56px;color:var(--head);overflow-wrap:anywhere'}),item.tag&&item.tag!==item.name?el('p',{text:item.tag}):null,item.description?el('p',{text:item.description}):null])]);
  const metrics=[['Level',item.level],['Prestige',item.prestige],['Seasonal ELO',item.elo],['Members',item.members],['Founded',item.foundedAt?formattedDate(item.foundedAt):null],['Guild bank balance',item.bankBalance],['Total guild XP',item.totalExperience],['Weekly activity score',item.activityScore]];
  const stats=el('div',{class:'stats',style:'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:16px'},metrics.map(([label,number])=>el('div',{class:'stat',style:'display:flex;flex-direction:column;align-items:flex-start;gap:8px;min-width:0;padding:16px'},[el('b',{text:value(number),style:'font-size:28px;line-height:36px'}),el('span',{text:label})])));
  const details=el('div',{},[el('h3',{text:'Public members',style:'font-size:24px;line-height:32px'}),item.membersList?.length?el('ul',{class:'plain'},item.membersList.map(name=>el('li',{class:'who'},[el('span',{text:name})]))):el('p',{text:'Member names are not available yet. The member count above comes from the server.'}),el('p',{text:'Recruitment: '+(item.recruiting===null||item.recruiting===undefined?'Not available':item.recruiting?'Open':'Closed')}),el('p',{text:'Guild stance: '+(item.peaceful===null||item.peaceful===undefined?'Not available':item.peaceful?'Peaceful':'Hostile')})]);
  node.replaceChildren(heading,stats,details);
  if(limited)node.append(el('p',{text:'This page currently shows leaderboard details. Full guild profiles, recruitment and membership details are not connected yet.'}));
  if(!item.banner)node.append(el('p',{text:'This guild’s banner design is not available yet.'}));
  for(const entry of item.links??[])node.append(link(entry.url,entry.label,'btn btn-dark'));
}
function clone(type,item){
  const template=templates.get(type+':'+(preview?item.designIndex??0:0))??templates.get(type+':0');if(!template)return null;
  const node=template.content.firstElementChild.cloneNode(true);for(const element of [node,...node.querySelectorAll('*')])for(const attr of [...element.attributes]){
    if(attr.name==='class')element.className=attr.value.replace(/\{\{[^}]+\}\}/g,'').trim();
    if(attr.name.startsWith('data-b-')||attr.name.startsWith('data-on-'))element.removeAttribute(attr.name);
  }return node;
}
function target(type){return templates.get(type+':0')?.parentElement;}
function replace(type,nodes){const parent=target(type);if(!parent)return;for(const node of [...parent.children])if(node.hasAttribute('data-rendered-record'))node.remove();for(const node of nodes){if(!node)continue;node.setAttribute('data-rendered-record','');parent.insertBefore(node,templates.get(type+':0'));}}
function metricValue(label,item){const key=new Map([['level','level'],['members','members'],['seasonal elo','elo'],['prestige','prestige'],['founded','foundedAt'],['raw gold','balance'],['balance','balance'],['playtime','playtime'],['reputation','reputation']]).get(label.toLowerCase());const value=key?item[key]:null;return value===undefined||value===null?'Unavailable':key==='foundedAt'?formattedDate(value):String(value);}
function hydrateProfile(node,item){
  // Preview variants are immutable, user-supplied sample presentations. API records never select
  // a variant on production pages, and no live record is merged into literal sample data.
  if(preview)return;
  if(kind==='guilds'){guildProfile(node,item);return;}
  const name=one('h2,h3',node);
  const stats=[...node.querySelectorAll('.stat')].map(stat=>({stat,label:one('span',stat)?.textContent??''}));
  for(const leaf of node.querySelectorAll('*'))if(!leaf.children.length&&!['BUTTON','IMG'].includes(leaf.tagName))leaf.textContent='';
  if(name)name.textContent=item.name;
  for(const {stat,label} of stats){const value=one('b,strong',stat);if(value)value.textContent=metricValue(label,item);const caption=one('span',stat);if(caption)caption.textContent=label;}
  for(const p of node.querySelectorAll('p'))if(!/PROFILE|History|Members|Join/.test(p.textContent))p.textContent='';
  for(const list of node.querySelectorAll('ul'))list.replaceChildren();
  for(const tag of node.querySelectorAll('.tag'))tag.textContent='';

  const description=name?.parentElement.querySelector('p:not(:first-child)');if(description)description.textContent=item.description??'';
  for(const img of node.querySelectorAll('img'))img.remove();
  for(const live of node.querySelectorAll('.live'))live.remove();
  for(const banner of node.querySelectorAll('.bn')){banner.className=banner.classList.contains('lg')?'bn lg':'bn';if(item.banner&&window.EnthusiaGuildBannerRenderer)banner.replaceChildren(window.EnthusiaGuildBannerRenderer.create(item.banner,item.name+' banner'));}
  for(const anchor of node.querySelectorAll('a')){anchor.textContent='';anchor.removeAttribute('href');}
  for(const button of node.querySelectorAll('button'))button.hidden=true;
  const memberList=one('ul.plain',node);if(memberList&&item.membersList)for(const member of item.membersList)memberList.append(el('li',{class:'who'},[el('span',{text:member})]));
  if(kind==='players'){
    const articles=[...node.querySelectorAll('article')],market=articles.find(article=>article.textContent.includes('Market'));
    if(market)market.append(link('market.html#owner='+encodeURIComponent(item.name),'View public market stalls','btn btn-gold'));
  }
  if(item.links?.length)for(const entry of item.links)node.append(link(entry.url,entry.label,'btn btn-dark'));
}
function choose(item){selected=item;const panel=clone('profile',item);if(panel){hydrateProfile(panel,item);replace('profile',[panel]);}for(const row of document.querySelectorAll('[data-record-id]'))row.setAttribute('aria-pressed',String(row.dataset.recordId===item.id));history.replaceState(null,'','#'+encodeURIComponent(item.id));}
function pressed(node){for(const sibling of node.parentElement.querySelectorAll('button'))sibling.setAttribute('aria-pressed',String(sibling===node));}
function draw(){
  let rows=items.filter(item=>item.name.toLowerCase().includes(q.toLowerCase())&&(filter==='all'||item.state===filter||(filter==='recruiting'&&item.recruiting)||(filter==='peaceful'&&item.peaceful===true)||(filter==='hostile'&&item.peaceful===false)));
  rows=rows.sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):(b[sort]??-1)-(a[sort]??-1));
  const type=kind==='players'?'picker':'row';
  replace(type,rows.map((item,index)=>{
    const node=clone(type,item);if(!node)return null;node.dataset.recordId=item.id;
    if(kind==='guilds'){
      const rank=one('.rk span',node);if(rank)rank.textContent=index+1;
      if(!preview){one('.nm>span',node).textContent=item.name;one('.nm small',node).textContent='Level '+(item.level??'Not available')+' · '+(item.members??'Not available')+' members'+(item.elo===null||item.elo===undefined?' · ELO unavailable':' · '+item.elo+' ELO');for(const tag of node.querySelectorAll('.tag'))tag.remove();if(item.recruiting)node.append(el('span',{class:'tag tag-good',text:'Recruiting'}));for(const banner of node.querySelectorAll('.bn'))banner.replaceWith(guildBanner(item));}
    }else if(kind==='bounties'){
      node.classList.toggle('done',item.state==='claimed');if(!preview){one('h3',node).textContent=item.name;const fields=[...node.children].filter(child=>child.tagName==='SPAN');if(fields[1])fields[1].textContent=item.gold??'Unavailable';if(fields[3])fields[3].textContent=item.description??'';if(fields[4])fields[4].textContent=item.expiresAt?formattedDate(item.expiresAt):'';const img=one('img',node);if(img)img.src='https://minotar.net/helm/'+encodeURIComponent(item.name)+'/96';}
    }else if(!preview)node.textContent=item.name;
    if(kind!=='bounties'){node.setAttribute('aria-pressed',String(selected?.id===item.id));node.addEventListener('click',()=>choose(item));}return node;
  }));
  const count=one('[data-b-text="countLine"]');if(count)count.textContent=kind==='guilds'?rows.length+' of '+items.length+(limited?' guilds in this leaderboard.':' guilds shown.'):rows.length+' '+(rows.length===1?'bounty':'bounties')+' shown.';
  for(const empty of document.querySelectorAll('[data-b-class*="emptyShow"],[data-b-class*="missShow"]'))empty.hidden=rows.length>0;
  if(kind==='guilds'&&rows.length&&!rows.some(item=>item.id===selected?.id))choose(rows[0]);
}
async function start(){
  for(const empty of document.querySelectorAll('[data-b-class*="missShow"],[data-b-class*="emptyShow"]')){empty.hidden=true;if(!preview)empty.textContent="No public records match this search.";}
  if(kind==='bounties')for(const value of document.querySelectorAll('main .stats .stat>b'))value.textContent='...';
  const input=one('[data-on-change="setQ"]');input?.addEventListener('input',()=>{q=input.value;if(kind!=='players')draw();});
  const filters=new Map([['pickFAll','all'],['pickFRec','recruiting'],['pickFHos','hostile'],['pickFPea','peaceful'],['pickOpen','open'],['pickClaimed','claimed'],['pickAll','all']]);
  const sorts=new Map([['pickSLvl','level'],['pickSElo','elo'],['pickSMem','members'],['pickSName','name'],['pickHigh','gold'],['pickNew','date']]);
  for(const node of document.querySelectorAll('[data-on-click]')){const action=node.dataset.onClick;if(filters.has(action))node.addEventListener('click',()=>{filter=filters.get(action);pressed(node);draw();});if(sorts.has(action))node.addEventListener('click',()=>{sort=sorts.get(action);pressed(node);draw();});}
  one(kind==='guilds'?'[data-on-click="pickFAll"]':'[data-on-click="pickOpen"]')?.setAttribute('aria-pressed','true');one(kind==='guilds'?'[data-on-click="pickSLvl"]':'[data-on-click="pickHigh"]')?.setAttribute('aria-pressed','true');
  one('[data-on-click="find"]')?.addEventListener('click',()=>{const item=items.find(v=>v.name.toLowerCase().startsWith(q.toLowerCase()));if(item){choose(item);one('[data-b-class*="missShow"]').hidden=true;}else{const miss=one('[data-b-class*="missShow"]');miss.textContent='No public profile by that name.';miss.hidden=false;}});
  try{const data=await api(kind);items=data.items;limited=data.limited===true;
    if(kind==='guilds'&&!preview){for(const [action,key] of [['pickFRec','recruiting'],['pickFHos','peaceful'],['pickFPea','peaceful'],['pickSElo','elo']]){const control=one('[data-on-click="'+action+'"]');if(control&&!items.some(item=>item[key]!==null&&item[key]!==undefined)){control.disabled=true;control.title='Server data for this filter is not available yet.';}}for(const live of document.querySelectorAll('main .live'))if(limited)live.parentElement.textContent='Limited server export';}
    draw();if(kind==='players'&&items.length)choose(items.find(item=>item.id===decodeURIComponent(location.hash.slice(1)))??items[0]);
    if(kind==='bounties'){const open=items.filter(v=>v.state==='open');const values=[open.length,open.reduce((sum,item)=>sum+(item.gold??0),0).toLocaleString('en-US'),Math.max(0,...open.map(item=>item.gold??0)).toLocaleString('en-US'),preview?items.filter(v=>v.state==='claimed').length:'Unavailable'];document.querySelectorAll('main .stats .stat>b').forEach((node,i)=>node.textContent=values[i]??'Unavailable');}
    if(data.limited||data.stale){status.hidden=false;status.textContent=data.limited?'Only leaderboard guilds are available here. Full guild profiles and recruitment details are not connected yet.':'The last server export is stale.';}
  }catch(error){status.hidden=false;status.textContent=error.message;for(const live of document.querySelectorAll('main .live'))live.parentElement.hidden=true;if(kind==='bounties')for(const node of document.querySelectorAll('main .stats .stat>b'))node.textContent='Unavailable';}
}
start().catch(error=>notice(error.message));
