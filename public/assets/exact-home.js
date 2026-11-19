import { api } from './community-dom.js';
const preview=document.documentElement.hasAttribute('data-preview-root');
const date=value=>value.toLocaleDateString('en-US',{month:'short',day:'numeric'});
if (!preview) {
  Promise.allSettled([fetch('/api/competitions').then(r=>{if(!r.ok)throw new Error();return r.json();}),api('news')]).then(([competition,news])=>{
    const cards=document.querySelectorAll('#happening a');
    const render=(card,title,summary)=>{const lines=card.firstElementChild.children;lines[1].textContent=title;lines[2].textContent=summary;};
    const upcoming=competition.status==='fulfilled'?competition.value.competitions.find(c=>c.lifecycleState==='UPCOMING'):null;
    render(cards[0],upcoming?.title??'Competitions',upcoming?.config?.public?.summary??'See the current competition schedule.');
    if(upcoming)cards[0].href='competitions/detail.html?competition='+encodeURIComponent(upcoming.slug);else cards[0].href='events.html';
    const post=news.status==='fulfilled'?news.value.items[0]:null;render(cards[1],post?.title??'Latest news',post?date(new Date(post.date??post.updatedAt))+' - '+(post.authorName??'Staff'):'Read published server announcements.');
    if(post?.slug)cards[1].href='news/'+encodeURIComponent(post.slug);
  });
}

const formerHomeSections = {
  '#join': 'join.html',
  '#gallery': 'gallery.html',
  '#leaderboards': 'leaderboards.html',
  '#faq-title': 'join.html#join-faq-title',
  '#staff-title': 'staff.html'
};
if (Object.hasOwn(formerHomeSections, location.hash)) {
  location.replace(formerHomeSections[location.hash]);
}
