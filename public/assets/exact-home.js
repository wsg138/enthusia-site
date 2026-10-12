import { api } from './community-dom.js';
import { renderWarzone } from './warzone-view.js';
const preview=document.documentElement.hasAttribute('data-preview-root');
const set=(name,value)=>{for(const node of document.querySelectorAll('[data-b-text="'+name+'"]'))node.textContent=value;};
const now=new Date(),start=new Date(now);start.setUTCHours(0,0,0,0);start.setUTCDate(start.getUTCDate()-((start.getUTCDay()+6)%7));const end=new Date(start);end.setUTCDate(end.getUTCDate()+6);
const date=value=>value.toLocaleDateString('en-US',{month:'short',day:'numeric'});
set('wzWeek','DUEL WEEK · '+start.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).toUpperCase()+' TO '+end.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).toUpperCase()+' · UTC');
const warzone=document.querySelector('#warzone-title')?.closest('section');
renderWarzone(warzone,null);
api('warzone').then(data=>renderWarzone(warzone,data)).catch(()=>{});
set('wzNext','Next event to be announced');set('wzNextIn','Soon');
if(preview){set('wzNext','Build Competition voting opens');set('wzNextIn','In '+Math.ceil((Date.UTC(2026,9,14,4)-Date.now())/86400000)+' days');}
else {
  Promise.allSettled([fetch('/api/competitions').then(r=>{if(!r.ok)throw new Error();return r.json();}),api('news')]).then(([competition,news])=>{
    const cards=document.querySelectorAll('#happening a');
    const render=(card,title,summary)=>{const lines=card.firstElementChild.children;lines[1].textContent=title;lines[2].textContent=summary;};
    const upcoming=competition.status==='fulfilled'?competition.value.competitions.find(c=>c.lifecycleState==='UPCOMING'):null;
    render(cards[0],upcoming?.title??'Competitions',upcoming?.config?.public?.summary??'See the current competition schedule.');
    if(upcoming)cards[0].href='competitions/detail.html?competition='+encodeURIComponent(upcoming.slug);else cards[0].href='competitions/index.html';
    const post=news.status==='fulfilled'?news.value.items[0]:null;render(cards[1],post?.title??'Latest news',post?date(new Date(post.date??post.updatedAt))+' - '+(post.authorName??'Staff'):'Read published server announcements.');
  });
}
