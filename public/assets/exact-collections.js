import { api,el } from './community-dom.js';
import { notice } from './exact-markup.js';
import { createHistoryOrder } from './history-order.js';
import { restoreTimelineScreenshots } from './timeline-screenshots.js';
import { timelineDisplayBody, timelineReleaseTitle } from './timeline-content.js?v=release-details';
import { renderHallOfFame } from './halloffame-render.js';
const kind=document.body.dataset.exactCollection,params=new URL(location.href).searchParams;
const demo=kind==='timeline'&&params.get('timeline-restore-demo')==='1'||kind==='halloffame'&&params.get('halloffame-live-demo')==='1';
const preview=document.documentElement.hasAttribute('data-preview-root')&&!demo;
const controls=new Map(['timeline','changelog','roadmap','halloffame','creators','museum','achievements'].map(name=>[name,new URL('./exact-controls/'+name+'.js',import.meta.url)]));
const prefixes=new Map([['timeline','e'],['changelog','l'],['roadmap','i'],['halloffame','t'],['creators','vd'],['museum','m'],['achievements','t']]);
const templates=new Map([...document.querySelectorAll('template[data-collection-template]')].map(node=>[Number(node.dataset.variant),node]));
function tag(item,allowed,fallback){return item.tags?.find(value=>allowed.includes(value))??fallback;}
function historyDate(item,node){
  if(!preview||item.date)return item.date;
  const date=node.querySelector('.ev-date');
  const day=date?.querySelector('b')?.textContent?.trim(),year=date?.querySelector('span')?.textContent?.trim();
  const value=Date.parse(`${day??''} ${year??''} UTC`);
  return Number.isFinite(value)?new Date(value).toISOString():null;
}
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
  const body=kind==='timeline'?timelineDisplayBody(item.body):item.body;
  const title=node.querySelector('h2,h3,.vtitle')??node.querySelector('strong,b,.tag'),description=node.querySelector('p'),image=node.querySelector('img');
  for(const leaf of [...node.querySelectorAll('*')])if(!leaf.children.length&&!['IMG','BUTTON'].includes(leaf.tagName))leaf.textContent='';
  if(title)title.textContent=item.title??item.name;
  if(description)description.textContent=body??item.description??'';
  else if(body)(node.querySelector('.panel')??node).append(el('p',{text:body,style:'white-space:pre-wrap'}));
  for(const list of node.querySelectorAll('ul'))list.replaceChildren();
  for(const anchor of node.querySelectorAll('a')){anchor.removeAttribute('href');anchor.textContent='';}
  if(item.target&&node.tagName==='A')node.href=item.target;
  else if(node.tagName==='A')node.removeAttribute('href');
  if(image){if(item.image){image.src=item.image;image.alt=item.title??item.name;}else image.remove();}
  if(item.image&&!image&&kind!=='museum')node.append(el('img',{src:item.image,alt:item.title??item.name,style:'width:100%;height:auto'}));
  if(kind==='museum'){const map=node.querySelector('.map');if(map){map.className='map';map.style.backgroundImage=item.image?'url("'+item.image+'")':'none';map.style.backgroundSize='contain';}node.querySelector('button')?.setAttribute('aria-label',item.title);const label=node.querySelector(':scope>span');if(label)label.textContent=item.title;}
  if(kind==='timeline'||kind==='changelog'){
    const date=node.querySelector('.ev-date'),value=new Date(item.date);if(date)date.replaceChildren(el('b',{text:item.date?value.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}):'Undated'}),el('span',{text:item.date?value.getUTCFullYear():''}));
    if(kind!=='timeline'&&item.verification!=='verified')node.querySelector('.ev-card')?.append(el('span',{class:'tag tag-plain',text:'Awaiting source verification'}));
  }
}
function populateTimelineCard(node,item,index,timelineSources,releaseNotes){
  const source = timelineSources.get(node.querySelector('h3').textContent);
  if(!preview){
    restoreTimelineScreenshots(node,item,templates);
    const category = String(item.category || 'milestone').toLowerCase();
    const known = ['milestone','guild','update','community','event'].includes(category);
    const marker = known ? 'k-' + category : '';
    node.setAttribute('data-b-class', 'ev ' + marker + ' {{e' + index + '}}');
    const badge = node.querySelector('.ev-text .tag');
    badge.textContent = category.charAt(0).toUpperCase() + category.slice(1);
    badge.className = 'tag ' + ({milestone:'tag-gold',guild:'tag-guild',community:'tag-dark',event:'tag-red'}[category] || 'tag-plain');
    const displayDate = source?.content.querySelector('.ev-date b')?.textContent;
    const originalYear = source?.content.querySelector('.ev-date span')?.textContent;
    if (item.date?.startsWith(originalYear + '-') && displayDate && !/^\d{1,2} [A-Z][a-z]{2}$/.test(displayDate)) {
      node.querySelector('.ev-date b').textContent = displayDate;
    }
    const summary = node.querySelector('.ev-text p');
    const originalText = source?.content.querySelector('.ev-text p')?.textContent;
    const caption = source?.content.querySelector('.ev-shot figcaption, .ev-shot span')?.textContent;
    if (originalText) {
      const imported = summary.textContent.trim();
      const alternatives = [originalText, badge.textContent + ' ' + originalText];
      if (caption) alternatives.push(...alternatives.map(text => text + ' ' + caption));
      if (alternatives.includes(imported)) summary.textContent = originalText;
    }
  }
  const release = releaseNotes.get(timelineReleaseTitle(item.slug));
  if(release){
    const details = el('details',{class:'timeline-release'},[
      el('summary',{text:'Release details'}),
      el('ul',{},release.body.split(/\r?\n/).filter(Boolean).map(line => el('li',{text:line.replace(/^- /,'')})))
    ]);
    node.querySelector('.ev-text').append(details);
  }
}
function renderAchievementDefinitions(section,items,data){
  section.hidden=false;const prototype=section.querySelector('li.who'),list=prototype?.parentElement;
  if(!prototype||!list){section.replaceChildren(el('div',{class:'panel exact-empty',text:'No exported achievement definitions.'}));return;}
  const rows=items.map(item=>{const row=prototype.cloneNode(true);row.removeAttribute('data-b-class');const fields=row.querySelectorAll(':scope>span');fields[0].replaceChildren(document.createTextNode(item.name),el('small',{text:item.description}));fields[1].textContent=item.reward?.trim()||'Not exported';row.dataset.category=item.category??'Other';return row;});list.replaceChildren(...rows);
  const tabs=section.querySelector('[data-on-click]')?.parentElement;
  if(tabs){tabs.replaceChildren(...['All',...new Set(items.map(item=>item.category??'Other'))].map(category=>{const button=el('button',{class:'chip',type:'button','aria-pressed':String(category==='All'),text:category});button.addEventListener('click',()=>{for(const peer of tabs.children)peer.setAttribute('aria-pressed',String(peer===button));for(const row of rows)row.hidden=category!=='All'&&row.dataset.category!==category;});return button;}));}
  const stats=section.querySelector('.stats');
  if(stats)stats.replaceChildren(...[['Registered achievements',items.length],['Categories',new Set(items.map(item=>item.category)).size]]
    .map(([label,value])=>el('div',{class:'stat'},[el('b',{text:value}),el('span',{text:label})])));
  const account=stats?.nextElementSibling;if(account)account.replaceChildren(el('p',{text:'Complete challenges in game. Personal progress is not exported.'}));
  const note=section.querySelector('.note');if(note)note.textContent=data.stale?'The last server export is stale.':'Public server catalogue; reward details and completion totals may be unavailable.';
}
function renderCreatorCredits(section,items){
  if(!section)return;
  section.hidden=!items.length;
  // Event dates and submission instructions need their own published record.
  const instructions=section.querySelector('.panel');if(instructions)instructions.hidden=true;
  const list=section.querySelector('.tip ul');if(!list)return;
  list.replaceChildren(...items.map(item=>el('li',{class:'who'},[
    el('span',{text:item.title.replace(/^Media rank holder:\s*/, '')},[
      el('small',{text:item.body.split('\n')[0]}),
      ...(item.verification==='verified'?[]:[el('small',{text:'Awaiting source verification'})])
    ])
  ])));
}
async function start(){
  const sections=[...document.querySelectorAll('main>section')];
  // Literal reference-only summaries must never be mistaken for current server facts.
  if(!preview){for(const section of sections.slice(1))section.hidden=!(kind==='creators'&&section.getAttribute('aria-label')==='For creators');}
  const template=templates.values().next().value;
  try{
    const data=await api(kind);let items=data.items;
    if(kind==='creators'&&!preview){
      const credits=items.filter(item=>item.category==='Media rank holders');
      items=items.filter(item=>item.category!=='Media rank holders');
      renderCreatorCredits(sections.find(section=>section.getAttribute('aria-label')==='The Media rank'),credits);
    }
    if(kind==='halloffame'&&!preview){
      window.EnthusiaDesignModel=renderHallOfFame(items,templates);
      const script=document.createElement('script');script.src=controls.get(kind).href;
      script.onerror=()=>notice('Page controls are unavailable.');document.body.append(script);return;
    }
    if(kind==='achievements'&&!preview&&data.curated!==true){renderAchievementDefinitions(sections[1],items,data);return;}
    if(!items.length){const section=sections[1];if(section){section.hidden=false;section.replaceChildren(el('div',{class:'panel exact-empty'},[el('p',{text:'No published records yet.'})]));}return;}
    const historyEntries=[];
    const timelineSources = new Map();
    let releaseNotes = new Map();
    if (kind === 'timeline') {
      for (const template of templates.values()) {
        timelineSources.set(template.content.querySelector('h3').textContent, template);
      }
      try {
        const response = await fetch(new URL('./release-history.json', import.meta.url));
        if (response.ok) releaseNotes = new Map((await response.json()).map(note => [note.title, note]));
      } catch { /* The timeline remains readable when the optional archive is unavailable. */ }
    }
    for(const [index,item]of items.entries()){
      const group=kind==='timeline'?tag(item,['dev','beta1','beta2','ch1','ch2'],'ch2'):kind==='roadmap'?tag(item,['live','next','later'],'later'):kind==='halloffame'?tag(item,['ch2','ch1','beta'],'ch2'):null;
      const original=preview?templates.get(item.designIndex)??template:group?[...templates.values()].find(node=>node.dataset.group===group)??template:template;if(!original)continue;
      const node=original.content.firstElementChild.cloneNode(true),prefix=prefixes.get(kind);node.dataset.apiRecord='';
      if(kind==='timeline'&&!preview)for(const shot of node.querySelectorAll('.ev-shot'))shot.remove();
      for(const element of [node,...node.querySelectorAll('*')])for(const attr of [...element.attributes])if(attr.name.startsWith('data-b-')||attr.name.startsWith('data-on-')){let value=attr.value.replace(/(vd|[eilmt])\d+/g,(value,family)=>family===prefix?prefix+index:value);if(kind==='museum')value=value.replace(/mk\d+/g,'mk'+index);element.setAttribute(attr.name,value);}
      populate(node,item);
      if(kind==='timeline')populateTimelineCard(node,item,index,timelineSources,releaseNotes);
      original.parentElement.insertBefore(node,original);
      if(kind==='timeline'||kind==='changelog')historyEntries.push({date:historyDate(item,node),node,era:node.closest('.era')});
    }
    if(!preview){
      for(const section of sections.slice(1)){if(section.querySelector('template[data-collection-template]'))section.hidden=false;}
      for(const stat of document.querySelectorAll('main .stat>b'))stat.textContent='Unavailable';
      if(kind==='timeline')for(const template of templates.values()){const group=template.dataset.group,head=template.parentElement.previousElementSibling;const count=[...(head?.querySelectorAll('p')??[])].find(p=>/\d+ entries/.test(p.textContent));if(count)count.textContent=items.filter(item=>tag(item,['dev','beta1','beta2','ch1','ch2'],'ch2')===group).length+' entries';}
      // Unbound podium/spotlight example articles are not part of the live collection.
      for(const article of document.querySelectorAll('main article'))if(!article.closest('[data-api-record]'))article.hidden=true;
    }
    window.EnthusiaDesignModel=preview?data.model:model(items);
    if(kind==='timeline'||kind==='changelog'){
      const eras=kind==='timeline'?[...document.querySelectorAll('.tl > .era')]:[];
      window.EnthusiaHistoryOrder=createHistoryOrder(historyEntries,eras);
      window.EnthusiaHistoryOrder('newest');
    }
    if(kind==='museum'&&!preview){
      const detail=document.querySelector('[data-b-text="dNo"]')?.closest('.panel');
      window.EnthusiaMuseumSelection=index=>{const item=items[index];if(!item||!detail)return;detail.querySelector('h3').textContent=item.title;detail.querySelector(':scope>p:nth-of-type(2)').textContent=item.body;for(const dd of detail.querySelectorAll('dd'))if(!dd.querySelector('[data-b-text]'))dd.textContent='Unavailable';const image=detail.querySelector('.map');image.style.backgroundImage=item.image?'url("'+item.image+'")':'none';image.style.backgroundSize='contain';image.replaceChildren();};
    }
    const script=document.createElement('script');const control=controls.get(kind);
    if(kind==='timeline'||kind==='changelog')control.searchParams.set('v','history-order-20261102');
    script.src=control.href;script.onerror=()=>notice('Page controls are unavailable.');document.body.append(script);
  }catch(error){const section=sections[1];if(section){section.hidden=false;section.replaceChildren(el('div',{class:'panel exact-empty'},[el('p',{role:'status',text:error.message})]));}}
}
start().catch(error=>notice(error.message));
