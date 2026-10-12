import { api,el } from './community-dom.js';
const preview=document.documentElement.hasAttribute('data-preview-root');
async function json(path){const response=await fetch(path);if(!response.ok)throw new Error('Event data is unavailable.');return response.json();}
async function start(){
  const now=new Date();window.EnthusiaEventDesignMonths=preview?[['October 2026',9,31],['November 2026',10,30]]:[0,1].map(offset=>{const date=new Date(now.getFullYear(),now.getMonth()+offset,1);return [date.toLocaleDateString('en-US',{month:'long',year:'numeric'}),date.getMonth(),new Date(date.getFullYear(),date.getMonth()+1,0).getDate()];});
  window.EnthusiaEventDesignNext=[];
  if(preview)window.EnthusiaEventDesignNext=await api('eventDesign');
  else {
    const results=await Promise.allSettled([json('/api/events/schedule'),json('/api/competitions')]);
    const dates=[];
    if(results[0].status==='fulfilled'){const schedule=results[0].value;for(const [title,value] of [['Server event',schedule.physicalEvents?.nextEventAt],['Event voting',schedule.physicalEvents?.nextVoteAt],['Chat event',schedule.chatEvents?.nextChatEventAt]])if(value)dates.push({date:new Date(value),title});}
    if(results[1].status==='fulfilled')for(const competition of results[1].value.competitions??[])for(const [field,label]of [['submissionsOpenAt','entries open'],['votingOpenAt','voting opens']]){const value=competition.config?.schedule?.[field];if(value)dates.push({date:new Date(value),title:competition.title+' '+label});}
    window.EnthusiaEventDesignNext=dates.filter(row=>Number.isFinite(row.date.getTime())).sort((a,b)=>a.date-b.date).map(row=>[[row.date.getUTCFullYear(),row.date.getUTCMonth(),row.date.getUTCDate(),row.date.getUTCHours(),row.date.getUTCMinutes(),row.date.getUTCSeconds()],row.title,'See the event details for current participation rules.',row.date.toLocaleString()]);
    for(const [index,calendar]of [...document.querySelectorAll('.cal')].entries()){
      const start=new Date(now.getFullYear(),now.getMonth()+index,1),days=new Date(start.getFullYear(),start.getMonth()+1,0).getDate();calendar.replaceChildren(...['Su','Mo','Tu','We','Th','Fr','Sa'].map(text=>el('span',{class:'dow',text})));
      for(let n=0;n<start.getDay();n++)calendar.append(el('span'));
      for(let day=1;day<=days;day++){const event=dates.find(row=>row.date.getFullYear()===start.getFullYear()&&row.date.getMonth()===start.getMonth()&&row.date.getDate()===day),today=now.getFullYear()===start.getFullYear()&&now.getMonth()===start.getMonth()&&now.getDate()===day;calendar.append(el('span',{class:'d'+(event?' on':'')+(today?' today':''),title:event?.title??'',text:day}));}
      calendar.setAttribute('aria-label',window.EnthusiaEventDesignMonths[index][0]+' event calendar');
      for(const sibling of [...calendar.parentElement.children])if(sibling!==calendar)sibling.remove();
    }
  }
  const script=document.createElement('script');script.src=new URL('./exact-controls/events.js',import.meta.url).href;document.body.append(script);
}
start().catch(()=>{const heading=document.querySelector('[data-b-text="nextTitle"]');if(heading)heading.textContent='Event data is unavailable.';});
