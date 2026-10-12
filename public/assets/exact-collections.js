import { api,el } from './community-dom.js';
import { notice } from './exact-markup.js';
const kind=document.body.dataset.exactCollection,preview=document.documentElement.hasAttribute('data-preview-root');
const controls=new Map(['timeline','changelog','roadmap','halloffame','creators','museum','achievements'].map(name=>[name,new URL('./exact-controls/'+name+'.js',import.meta.url)]));
const prefixes=new Map([['timeline','e'],['changelog','l'],['roadmap','i'],['halloffame','t'],['creators','vd'],['museum','m'],['achievements','t']]);
const templates=new Map([...document.querySelectorAll('template[data-collection-template]')].map(node=>[Number(node.dataset.variant),node]));
function tag(item,allowed,fallback){return item.tags?.find(value=>allowed.includes(value))??fallback;}
function model(items){
  if(kind==='timeline')return items.map(item=>[tag(item,['dev','beta1','beta2','ch1','ch2'],'ch2'),item.category?.toLowerCase()??'milestone']);
  if(kind==='changelog')return items.map(item=>[item.date?String(new Date(item.date).getUTCFullYear()):'2026',item.tags??[],(item.title+' '+item.body).toLowerCase()]);
  if(kind==='roadmap')return items.map(item=>[tag(item,['live','next','later'],'later'),item.category?.toLowerCase()??'building']);
  if(kind==='halloffame')return items.map(item=>tag(item,['ch2','ch1','beta'],'ch2'));
  if(kind==='creators')return items.map(item=>tag(item,['m0','m1','m2','m3','m4','other'],'other'));
  if(kind==='museum')return items.map(item=>[item.category?.toLowerCase()??'community',item.category??'Community','Not exported','Not exported']);
  return items.map(item=>item.category==='Retired'?'retired':'earn');
}
function populate(node,item){
  if(preview)return;
  const title=node.querySelector('h2,h3,.vtitle')??node.querySelector('strong,b,.tag'),description=node.querySelector('p'),image=node.querySelector('img');
  for(const leaf of [...node.querySelectorAll('*')])if(!leaf.children.length&&!['IMG','BUTTON'].includes(leaf.tagName))leaf.textContent='';
  if(title)title.textContent=item.title??item.name;
  if(description)description.textContent=item.body??item.description??'';
  else if(item.body)(node.querySelector('.panel')??node).append(el('p',{text:item.body,style:'white-space:pre-wrap'}));
  for(const list of node.querySelectorAll('ul'))list.replaceChildren();
  for(const anchor of node.querySelectorAll('a')){anchor.removeAttribute('href');anchor.textContent='';}
  if(item.target&&node.tagName==='A')node.href=item.target;
  else if(node.tagName==='A')node.removeAttribute('href');
  if(image){if(item.image){image.src=item.image;image.alt=item.title??item.name;}else image.remove();}
  if(item.image&&!image&&kind!=='museum')node.append(el('img',{src:item.image,alt:item.title??item.name,style:'width:100%;height:auto'}));
  if(kind==='museum'){const map=node.querySelector('.map');if(map){map.className='map';map.style.backgroundImage=item.image?'url("'+item.image+'")':'none';map.style.backgroundSize='contain';}node.querySelector('button')?.setAttribute('aria-label',item.title);const label=node.querySelector(':scope>span');if(label)label.textContent=item.title;}
  if(kind==='timeline'||kind==='changelog'){
    const date=node.querySelector('.ev-date'),value=new Date(item.date);if(date)date.replaceChildren(el('b',{text:item.date?value.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}):'Undated'}),el('span',{text:item.date?value.getUTCFullYear():''}));
    if(item.verification!=='verified')node.querySelector('.ev-card')?.append(el('span',{class:'tag tag-plain',text:'Awaiting source verification'}));
  }
}
function renderAchievementDefinitions(section,items){
  section.hidden=false;const prototype=section.querySelector('li.who'),list=prototype?.parentElement;
  if(!prototype||!list){section.replaceChildren(el('div',{class:'panel exact-empty',text:'No exported achievement definitions.'}));return;}
  const rows=items.map(item=>{const row=prototype.cloneNode(true);row.removeAttribute('data-b-class');const fields=row.querySelectorAll(':scope>span');fields[0].replaceChildren(document.createTextNode(item.name),el('small',{text:item.description}));fields[1].textContent=item.reward??'No reward exported';row.dataset.category=item.category??'Other';return row;});list.replaceChildren(...rows);
  const tabs=section.querySelector('[data-on-click]')?.parentElement;
  if(tabs){tabs.replaceChildren(...['All',...new Set(items.map(item=>item.category??'Other'))].map(category=>{const button=el('button',{class:'chip',type:'button','aria-pressed':String(category==='All'),text:category});button.addEventListener('click',()=>{for(const peer of tabs.children)peer.setAttribute('aria-pressed',String(peer===button));for(const row of rows)row.hidden=category!=='All'&&row.dataset.category!==category;});return button;}));}
  for(const count of section.querySelectorAll('.slot b,.stat b'))count.textContent=items.length;
  const lead=section.querySelector('h2')?.parentElement.querySelector('p:last-child');if(lead)lead.textContent=items.length+' public achievement definitions. Complete achievements in game and claim rewards with /rewards.';
}
async function start(){
  const sections=[...document.querySelectorAll('main>section')];
  // Literal reference-only summaries must never be mistaken for current server facts.
  if(!preview){for(const section of sections.slice(1))section.hidden=true;}
  const template=templates.values().next().value;
  try{
    const data=await api(kind),items=data.items;
    if(kind==='achievements'&&!preview&&data.curated!==true){renderAchievementDefinitions(sections[1],items);return;}
    if(!items.length){const section=sections[1];if(section){section.hidden=false;section.replaceChildren(el('div',{class:'panel exact-empty'},[el('p',{text:'No published records yet.'})]));}return;}
    for(const [index,item]of items.entries()){
      const group=kind==='timeline'?tag(item,['dev','beta1','beta2','ch1','ch2'],'ch2'):kind==='roadmap'?tag(item,['live','next','later'],'later'):kind==='halloffame'?tag(item,['ch2','ch1','beta'],'ch2'):null;
      const original=preview?templates.get(item.designIndex)??template:group?[...templates.values()].find(node=>node.dataset.group===group)??template:template;if(!original)continue;
      const node=original.content.firstElementChild.cloneNode(true),prefix=prefixes.get(kind);node.dataset.apiRecord='';
      for(const element of [node,...node.querySelectorAll('*')])for(const attr of [...element.attributes])if(attr.name.startsWith('data-b-')||attr.name.startsWith('data-on-')){let value=attr.value.replace(/(vd|[eilmt])\d+/g,(value,family)=>family===prefix?prefix+index:value);if(kind==='museum')value=value.replace(/mk\d+/g,'mk'+index);element.setAttribute(attr.name,value);}
      populate(node,item);original.parentElement.insertBefore(node,original);
    }
    if(!preview){
      for(const section of sections.slice(1)){if(section.querySelector('template[data-collection-template]'))section.hidden=false;}
      for(const stat of document.querySelectorAll('main .stat>b'))stat.textContent='Unavailable';
      if(kind==='timeline')for(const template of templates.values()){const group=template.dataset.group,head=template.parentElement.previousElementSibling;const count=[...(head?.querySelectorAll('p')??[])].find(p=>/\d+ entries/.test(p.textContent));if(count)count.textContent=items.filter(item=>tag(item,['dev','beta1','beta2','ch1','ch2'],'ch2')===group).length+' entries';}
      // Unbound podium/spotlight example articles are not part of the live collection.
      for(const article of document.querySelectorAll('main article'))if(!article.closest('[data-api-record]'))article.hidden=true;
    }
    window.EnthusiaDesignModel=preview?data.model:model(items);
    if(kind==='museum'&&!preview){
      const detail=document.querySelector('[data-b-text="dNo"]')?.closest('.panel');
      window.EnthusiaMuseumSelection=index=>{const item=items[index];if(!item||!detail)return;detail.querySelector('h3').textContent=item.title;detail.querySelector(':scope>p:nth-of-type(2)').textContent=item.body;for(const dd of detail.querySelectorAll('dd'))if(!dd.querySelector('[data-b-text]'))dd.textContent='Unavailable';const image=detail.querySelector('.map');image.style.backgroundImage=item.image?'url("'+item.image+'")':'none';image.style.backgroundSize='contain';image.replaceChildren();};
    }
    const script=document.createElement('script');script.src=controls.get(kind).href;script.onerror=()=>notice('Page controls are unavailable.');document.body.append(script);
  }catch(error){const section=sections[1];if(section){section.hidden=false;section.replaceChildren(el('div',{class:'panel exact-empty'},[el('p',{role:'status',text:error.message})]));}}
}
start().catch(error=>notice(error.message));
