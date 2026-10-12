import { el } from './community-dom.js';

export function weeklyDuelLeaders(items) {
  return items.filter(row=>row.type==='leader'&&Number.isInteger(row.wins)&&row.wins>=0)
    .sort((a,b)=>b.wins-a.wins||a.id.localeCompare(b.id)).slice(0,3);
}

export function renderWarzone(section,data) {
  const columns=section?.querySelectorAll('.wz-col');if(!columns?.length)return;
  const headings=['Current combat meta','Duel wins this week','Rotation schedule'];
  for(const [index,column] of [...columns].entries())column.replaceChildren(el('h3',{text:headings[index]}));
  const items=data?.items??[];
  const kit=items.find(row=>row.type==='kit');
  columns[0].append(el('p',{text:kit?.name??'Current combat meta is unavailable.'}));
  if(kit){columns[0].append(el('p',{text:kit.description}));if(kit.endsAt)columns[0].append(el('p',{class:'wz',text:'Next rotation: '+new Date(kit.endsAt).toLocaleString()}));}
  const leaders=weeklyDuelLeaders(items);
  const summary=items.find(row=>row.id==='duels-status');
  for(const [index,row]of leaders.entries())columns[1].append(el('p',{class:'wz',text:`${index+1}. ${row.name} — ${row.wins} match ${row.wins===1?'win':'wins'}`}));
  columns[1].append(el('p',{text:summary?.description??'Weekly WarzoneDuels results are unavailable.'}));
  const activities=items.filter(row=>row.type==='activity'&&row.id!=='duels-status');
  for(const row of activities)columns[2].append(el('p',{class:'wz',text:row.name+' — '+row.description}));
  if(!activities.length)columns[2].append(el('p',{text:'Rotation schedule is unavailable.'}));
  const indicator=section.querySelector('[data-warzone-status]')??section.querySelector('.live')?.parentElement;
  if(indicator){indicator.setAttribute('data-warzone-status','');indicator.textContent=data?(data.stale?'Last server export is stale':'Server snapshot · '+new Date(data.updatedAt).toLocaleString()):'Server feed unavailable';}
  if(data?.stale)columns[0].append(el('p',{text:'This snapshot is over 15 minutes old; the current meta may have changed.'}));
}
