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
  columns[1].append(el('p',{class:'wz-next-date',text:kit?.endsAt?dateLabel(kit.endsAt,{month:'short',day:'numeric'}):'Unavailable'}));
  if(kit?.endsAt)columns[1].append(el('p',{class:'wz-next-time',text:dateLabel(kit.endsAt,{hour:'numeric',minute:'2-digit',timeZoneName:'short'})}));
  if(next)columns[1].append(el('p',{class:'wz-next-name',text:next.name==='Next meta'?next.description:'Up next: '+next.name}));

  if(data?.capturedSnapshot&&data.availableWeeks?.length)columns[2].append(weekPicker(data));
  else if(data?.weekStart)columns[2].append(el('p',{class:'wz-week-label',text:weekLabel(data.weekStart)}));
  const leaders=weeklyDuelLeaders(items);
  for(const [index,row]of leaders.entries())columns[2].append(el('div',{class:'wz-leader'},[
    el('span',{class:'wz-rank',text:index+1}),el('span',{class:'wz-player',text:row.name}),el('strong',{class:'wz-score',text:row.wins+' '+(row.wins===1?'win':'wins')})
  ]));
  if(!leaders.length){const summary=items.find(row=>row.id==='duels-status');columns[2].append(el('p',{text:summary?.description?.startsWith('No counted')?'No wins recorded.':'Unavailable'}));}

  const indicator=section.querySelector('[data-warzone-status]')??section.querySelector('.live')?.parentElement;
  if(indicator){
    indicator.setAttribute('data-warzone-status','');
    indicator.textContent=data?(data.stale?'Outdated · ':data.capturedSnapshot?'Snapshot · ':'Updated · ')+dateLabel(data.updatedAt,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'Feed unavailable';
    indicator.title=data?.capturedSnapshot?'Captured server data; does not update automatically.':data?.stale?'The last server export is over 15 minutes old.':'';
  }
}
