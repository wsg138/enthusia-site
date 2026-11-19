import { el } from './community-dom.js';

const periods = { upcoming:'Upcoming', active:'Active', past:'Past' };
const stages = {
  UPCOMING:['upcoming','Entries open','submissionsOpenAt'],
  SUBMISSIONS_OPEN:['active','Entries close','submissionsCloseAt'],
  REVIEW:['active','Review closes','reviewCloseAt'],
  VOTING:['active','Voting closes','votingCloseAt'],
  JUDGING:['active','Judging closes','judgingCloseAt'],
  RESULTS_READY:['active','Results pending','resultsPublishedAt'],
  COMPLETED:['past','Completed','resultsPublishedAt'],
  ARCHIVED:['past','Archived','resultsPublishedAt']
};
const today = new Date();
let month = new Date(today.getFullYear(),today.getMonth(),1);
let period = new URL(location.href).searchParams.get('status');
if (!Object.hasOwn(periods,period)) period = 'upcoming';
let entries = [];
const one = selector => document.querySelector(selector);
const format = date => date.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date : null;
}
function competitionEntry(item) {
  const stage = stages[item.lifecycleState];
  if (!stage || !item.slug) return null;
  const schedule = item.config?.schedule || {};
  return {period:stage[0], label:stage[1], date:validDate(schedule[stage[2]]), title:item.title,
    summary:item.config?.public?.summary, href:'competitions/detail.html?competition='+encodeURIComponent(item.slug)};
}
function renderMonth(rows) {
  const grid = one('.calendar-days');
  one('[data-month-title]').textContent = month.toLocaleDateString(undefined,{month:'long',year:'numeric'});
  grid.replaceChildren(...['Su','Mo','Tu','We','Th','Fr','Sa'].map(text=>el('span',{text})));
  for (let n=0;n<month.getDay();n++) grid.append(el('span'));
  const days = new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  for (let day=1;day<=days;day++) {
    const date = new Date(month.getFullYear(),month.getMonth(),day);
    const matches = rows.filter(row=>row.date?.toDateString()===date.toDateString());
    const attrs = {text:day,'aria-current':today.toDateString()===date.toDateString()?'date':null};
    grid.append(matches.length ? el('a',{...attrs,href:'#'+matches[0].id,'aria-label':format(date)+' · '+matches.map(row=>row.title).join(', ')}) : el('span',attrs));
  }
}
function render(selectMonth=false) {
  const rows = entries.filter(row=>row.period===period).sort((a,b)=>{
    if (!a.date || !b.date) return Number(!!b.date)-Number(!!a.date);
    return period==='past'?b.date-a.date:a.date-b.date;
  });
  if (selectMonth) {
    const first=rows.find(row=>row.date)?.date || today;
    month=new Date(first.getFullYear(),first.getMonth(),1);
  }
  one('[data-agenda-title]').textContent=periods[period];
  for (const button of document.querySelectorAll('[data-period]')) button.setAttribute('aria-pressed',String(button.dataset.period===period));
  const cards=rows.map(row=>{
    const card=el('article',{class:'calendar-entry panel',id:row.id,tabindex:'-1'},[
      el('span',{class:'tag tag-dark',text:row.href?'Competition':'Server event'}),
      el('h3',{text:row.title}),el('p',{text:[row.label,row.date && (row.timed?row.date.toLocaleString():format(row.date))].filter(Boolean).join(' · ')})
    ]);
    if(row.summary)card.append(el('p',{text:row.summary}));
    if(row.href)card.append(el('a',{href:row.href,text:'View competition'}));
    return card;
  });
  one('[data-agenda]').replaceChildren(...(cards.length?cards:[el('p',{text:'No '+period+' items in the available calendar data.'})]));
  renderMonth(rows);
}
async function json(path) {
  const response=await fetch(path);
  if (!response.ok) throw new Error('Feed unavailable');
  return response.json();
}
async function load() {
  const sources=[
    ['Competition schedule','/api/competitions',data=>data.competitions.map(competitionEntry).filter(Boolean)],
    ['Event schedule','/api/events/schedule',data=>[
      ['Server event',data.physicalEvents?.nextEventAt],['Event voting',data.physicalEvents?.nextVoteAt],['Chat event',data.chatEvents?.nextChatEventAt]
    ].map(([title,value])=>({title,date:validDate(value),period:'upcoming',label:'Scheduled',timed:true})).filter(row=>row.date && row.date>=new Date())],
    ['Event results','/api/events/stats',data=>data.recentEvents.map(item=>({title:item.eventType,date:validDate(item.date),period:'past',summary:item.winner?'Winner · '+item.winner:'',label:'Result'}))],
    ['Historical results',new URL('event-results.json',import.meta.url),data=>data.map(item=>({...item,date:validDate(item.date+'T12:00:00'),period:'past',label:'Result'}))]
  ];
  const results=await Promise.allSettled(sources.map(async ([,url,convert])=>convert(await json(url))));
  const missing=[];
  entries=[];
  results.forEach((result,i)=>{
    if(result.status==='fulfilled') entries.push(...result.value);
    else missing.push(sources[i][0]);
  });
  entries.forEach((row,i)=>{row.id='calendar-entry-'+i;});
  one('[data-feed-status]').textContent=missing.length?'Unavailable: '+missing.join(', ')+'.':'';
  render(true);
}
for(const button of document.querySelectorAll('[data-period]')) button.addEventListener('click',()=>{
  period=button.dataset.period;
  const url=new URL(location.href);url.searchParams.set('status',period);url.hash='';
  history.replaceState(null,'',url);render(true);
});
for(const button of document.querySelectorAll('[data-month]')) button.addEventListener('click',()=>{
  month.setMonth(month.getMonth()+Number(button.dataset.month));render();
});
load();
