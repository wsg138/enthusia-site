import { api } from './community-dom.js';
const preview=document.documentElement.hasAttribute('data-preview-root');
const set=(name,value)=>{for(const node of document.querySelectorAll('[data-b-text="'+name+'"]'))node.textContent=value;};
const now=new Date(),start=new Date(now);start.setDate(start.getDate()-((start.getDay()+6)%7));const end=new Date(start);end.setDate(end.getDate()+6);
const date=value=>value.toLocaleDateString('en-US',{month:'short',day:'numeric'});
set('wzWeek','WEEK OF '+date(start).toUpperCase()+' TO '+date(end).toUpperCase());
set('wzNext','Next event to be announced');set('wzNextIn','Soon');
if(preview){set('wzNext','Build Competition voting opens');set('wzNextIn','In '+Math.ceil((Date.UTC(2026,9,14,4)-Date.now())/86400000)+' days');}
else {
  const warzone=document.querySelector('#warzone-title')?.closest('section');
  const labels=['Current kit','Top fighters this week','Also this week'];
  for(const [index,column] of [...(warzone?.querySelectorAll('.wz-col')??[])].entries()){const heading=column.querySelector('h3')??document.createElement('h3');heading.textContent=labels[index]??'Warzone';column.replaceChildren(heading);const note=document.createElement('p');note.textContent='Current server data is unavailable.';column.append(note);}
  api('warzone').then(data=>{
    const columns=warzone?.querySelectorAll('.wz-col');if(!columns)return;
    const kit=data.items.find(item=>item.type==='kit');if(kit){const heading=columns[0].querySelector('h3');columns[0].replaceChildren(heading);const title=document.createElement('p'),body=document.createElement('p');title.textContent=kit.name;body.textContent=kit.description;columns[0].append(title,body);if(kit.endsAt){const next=document.createElement('p');next.className='wz';next.textContent='Next rotation: '+new Date(kit.endsAt).toLocaleString();columns[0].append(next);}}
    const leaders=data.items.filter(item=>item.type==='leader').sort((a,b)=>(b.kills??0)-(a.kills??0)).slice(0,3);if(leaders.length){const heading=columns[1].querySelector('h3');columns[1].replaceChildren(heading);for(const [index,item]of leaders.entries()){const row=document.createElement('p');row.className='wz';row.textContent=(index+1)+'. '+item.name+' - '+(item.kills??'Unavailable')+' kills';columns[1].append(row);}}
    const activities=data.items.filter(item=>item.type==='activity');if(activities.length){const heading=columns[2].querySelector('h3');columns[2].replaceChildren(heading);for(const item of activities){const row=document.createElement(item.target?'a':'p');row.className='wz';row.textContent=item.name+' - '+item.description;if(item.target)row.href=item.target;columns[2].append(row);}}
    if(data.stale){const note=document.createElement('p');note.textContent='The last Warzone export is stale.';columns[0].append(note);}
  }).catch(()=>{});
  Promise.allSettled([fetch('/api/competitions').then(r=>{if(!r.ok)throw new Error();return r.json();}),api('news')]).then(([competition,news])=>{
    const cards=document.querySelectorAll('#happening a');
    const render=(card,title,summary)=>{const lines=card.firstElementChild.children;lines[1].textContent=title;lines[2].textContent=summary;};
    const upcoming=competition.status==='fulfilled'?competition.value.competitions.find(c=>c.lifecycleState==='UPCOMING'):null;
    render(cards[0],upcoming?.title??'Competitions',upcoming?.config?.public?.summary??'See the current competition schedule.');
    if(upcoming)cards[0].href='competitions/detail.html?competition='+encodeURIComponent(upcoming.slug);else cards[0].href='competitions/index.html';
    const post=news.status==='fulfilled'?news.value.items[0]:null;render(cards[1],post?.title??'Latest news',post?date(new Date(post.date??post.updatedAt))+' - '+(post.authorName??'Staff'):'Read published server announcements.');
  });
}
