import { el } from './community-dom.js';

export function weeklyDuelLeaders(items) {
  return items.filter(row=>row.type==='leader'&&Number.isInteger(row.wins)&&row.wins>=0)
    .sort((a,b)=>b.wins-a.wins||a.id.localeCompare(b.id)).slice(0,3);
}

function dateLabel(value,options) {
  const date=new Date(value);
  return Number.isFinite(date.getTime())?date.toLocaleString('en-US',options):'Unavailable';
}

function weekLabel(value) {
  const first=new Date(value+'T00:00:00Z'),last=new Date(first);
  if(!Number.isFinite(first.getTime()))return 'This week';
  last.setUTCDate(last.getUTCDate()+6);
  const start=first.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
  const end=first.getUTCMonth()===last.getUTCMonth()?last.getUTCDate():last.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
  return `${start}–${end} · UTC`;
}

function weekPicker(data) {
  const select=el('select',{'aria-label':'Duel results week',class:'wz-week-picker'});
  for(const week of data.availableWeeks)select.append(el('option',{value:week,text:weekLabel(week)}));
  select.value=data.weekStart;
  select.addEventListener('change',()=>{
    const url=new URL(location.href);url.searchParams.set('warzone-state',select.value===data.availableWeeks[0]?'captured':'last-week');url.hash='warzone';location.href=url.href;
  });
  return select;
}

function playerHead(row) {
  if(/^\/assets\/warzone\/player-skins\/[a-f0-9-]+\.png$/.test(row.skinTexture??'')){
    const source=new URL('./'+row.skinTexture.slice(8),import.meta.url).href;
    const head=el('span',{class:'wz-head wz-skin-head',role:'img','aria-label':row.name+' Minecraft head'},[el('span',{class:'wz-head-overlay','aria-hidden':'true'})]);
    head.style.backgroundImage=`url("${source}")`;
    head.firstElementChild.style.backgroundImage=`url("${source}")`;
    return head;
  }
  const identity=/^duels-[a-f0-9-]{36}$/.test(row.id)?row.id.slice(6):row.name;
  const head=el('img',{class:'wz-head',src:'https://mc-heads.net/avatar/'+encodeURIComponent(identity)+'/32',alt:row.name+' Minecraft head',width:32,height:32,loading:'lazy',decoding:'async'});
  head.addEventListener('error',()=>head.replaceWith(el('span',{class:'wz-head',role:'img','aria-label':row.name+' head unavailable'},[
    el('img',{src:new URL('./market/player-head-base.svg',import.meta.url).href,alt:'',width:32,height:32}),
    el('img',{class:'wz-fallback-overlay',src:new URL('./market/player-head-overlay.svg',import.meta.url).href,alt:'',width:32,height:32})
  ])),{once:true});
  return head;
}

export function renderWarzone(section,data) {
  const columns=section?.querySelectorAll('.wz-col');if(!columns?.length)return;
  for(const [index,column]of [...columns].entries())column.replaceChildren(el('h3',{text:['Active rules','Next rotation','Weekly duel wins'][index]}));
  const items=data?.items??[],kit=items.find(row=>row.type==='kit');
  const title=section.querySelector('[data-b-text="wzWeek"]');if(title)title.textContent='COMBAT';
  columns[0].append(el('p',{class:'wz-meta-name',text:kit?.name??'Unavailable'}));
  if(kit?.manualOverride)columns[0].append(el('span',{class:'wz-badge',text:'Manual override'}));
  if(kit?.rules?.length){const list=el('ul',{class:'wz-rules'});for(const rule of kit.rules.slice(0,6))list.append(el('li',{text:rule}));columns[0].append(list);}
  else if(kit?.description)columns[0].append(el('p',{text:kit.description}));

  const next=items.find(row=>row.id==='next-meta');
  const transition=next?.name==='Automatic schedule paused'?'Schedule paused':next?.name==='After override is cleared'?'Until cleared':'Unavailable';
  columns[1].append(el('p',{class:'wz-next-date',text:kit?.endsAt?dateLabel(kit.endsAt,{month:'short',day:'numeric'}):transition}));
  if(kit?.endsAt)columns[1].append(el('p',{class:'wz-next-time',text:dateLabel(kit.endsAt,{hour:'numeric',minute:'2-digit',timeZoneName:'short'})}));
  if(next)columns[1].append(el('p',{class:'wz-next-name',text:next.name==='Next meta'?next.description:'Up next: '+next.name}));

  if(data?.capturedSnapshot&&data.availableWeeks?.length)columns[2].append(weekPicker(data));
  else if(data?.weekStartsAt??data?.weekStart)columns[2].append(el('p',{class:'wz-week-label',text:weekLabel((data.weekStartsAt??data.weekStart).slice(0,10))}));
  const leaders=weeklyDuelLeaders(items);
  if(data?.duelUpdatedAt&&Date.now()-Date.parse(data.duelUpdatedAt)>900000)columns[2].append(el('p',{text:'Results outdated',class:'wz-week-label'}));
  for(const [index,row]of leaders.entries())columns[2].append(el('div',{class:'wz-leader'},[
    el('span',{class:'wz-rank',text:index+1}),playerHead(row),el('span',{class:'wz-player',text:row.name}),el('strong',{class:'wz-score',text:row.wins+' '+(row.wins===1?'win':'wins')})
  ]));
  if(!leaders.length){const summary=items.find(row=>row.id==='duels-status');columns[2].append(el('p',{text:summary?.description?.startsWith('No counted')?'No wins recorded.':'Unavailable'}));}

  const indicator=section.querySelector('[data-warzone-status]')??section.querySelector('.live')?.parentElement;
  if(indicator){
    indicator.setAttribute('data-warzone-status','');
    const outdated=data?.stale===true||Date.now()-Date.parse(data?.generatedAt??data?.updatedAt)>900000;
    indicator.textContent=data?(outdated?'Outdated · ':data.capturedSnapshot?'Snapshot · ':'Updated · ')+dateLabel(data.generatedAt??data.updatedAt,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'Feed unavailable';
    indicator.title=data?.capturedSnapshot?'Captured server data; does not update automatically.':data?.stale?'The last server export is over 15 minutes old.':'';
  }
}
