import { el } from './community-dom.js';
const preview=()=>document.documentElement.hasAttribute('data-preview-root');
function date(value){return value?new Date(value).toLocaleDateString('en-US',{month:'long',day:'numeric'}):'To be announced';}
function detail(competition){const root=new URL('../competitions/detail.html',import.meta.url);root.searchParams.set('competition',competition.slug);return root.href;}
export function renderExactFeatured(root,competition){
  if(!competition){root.replaceChildren(el('p',{class:'panel exact-empty',text:'No competition is currently scheduled.'}));return;}
  const node=document.querySelector('#exact-feature-template').content.cloneNode(true);
  if(!(preview()&&competition.visualVariant==='reference')){
    const heading=node.querySelector('h3');if(heading)heading.textContent=competition.title;
    const image=node.querySelector('img');const id=competition.config?.appearance?.bannerImageId;
    if(image){if(id)image.src='/api/competitions/media/'+encodeURIComponent(id);else image.remove();}
    const paragraphs=node.querySelectorAll('.tip>p');if(paragraphs[0])paragraphs[0].textContent=competition.config?.public?.summary??'';
    const tags=node.querySelectorAll('.tip .tag');if(tags[0])tags[0].textContent=competition.lifecycleState.replaceAll('_',' ');if(tags[1])tags[1].textContent='Theme: '+(competition.config?.public?.theme??competition.category);
    const schedule=competition.config?.schedule??{};
    const rows=node.querySelectorAll('.tip>div[style*="justify-content: space-between"]');const values=[date(schedule.submissionsOpenAt),date(schedule.votingOpenAt),date(schedule.resultsPublishedAt)];rows.forEach((row,i)=>{if(row.lastElementChild)row.lastElementChild.textContent=values[i]??'To be announced';});
    const steps=node.querySelectorAll('.trk');steps.forEach((step,i)=>{step.classList.toggle('now',i===0&&competition.lifecycleState==='UPCOMING');step.querySelector('small').textContent=i===0?competition.lifecycleState.replaceAll('_',' '):'See competition schedule';});
  }
  for(const anchor of node.querySelectorAll('a[href]'))if(anchor.href.includes('detail.html'))anchor.href=detail(competition);
  root.replaceChildren(node);
}
export function renderExactGrid(root,competitions,history=false){
  if(!competitions.length){root.replaceChildren(history?document.querySelector('#exact-history-empty').content.cloneNode(true):el('p',{class:'panel exact-empty',text:'No additional competitions are scheduled.'}));return;}
  root.replaceChildren(...competitions.map(competition=>{
    const node=document.querySelector('#exact-card-template').content.firstElementChild.cloneNode(true);
    if(!(preview()&&competition.visualVariant==='reference')){node.querySelector('h3').textContent=competition.title;node.querySelector('p').textContent=competition.config?.public?.summary??'';node.querySelector('.tag').textContent=competition.lifecycleState.replaceAll('_',' ');}
    node.querySelector('a').href=detail(competition);return node;
  }));
}
