import { el,link,button,api,status,markdown } from './community-dom.js';
const host=document.querySelector('[data-community-app]');
const kind=host?.dataset.communityApp;
const snapshots=new Set(['guilds','players','bounties','achievements']);
const kinds=['news','changelog','roadmap','timeline','halloffame','creators','museum','achievements','polls'];
let marketSnapshot;
document.body.classList.add('community-page');
const metric=(label,value)=>el('div',{class:'community-stat'},[el('span',{text:label}),el('strong',{text:value??'Unavailable'})]);
function appendPlayerMarket(item,container){
    const market=el('section',{class:'community-card'},[el('h3',{text:'At the Market'})]);container.append(market);
    const note=status(market,'Loading public stalls...');container.dataset.selectedPlayer=item.id;
    marketSnapshot??=fetch('https://market-api.enthusia.info/v1/market').then(async response=>{if(!response.ok)throw new Error('market_unavailable');const data=await response.json();if(data.schemaVersion!==1||!Array.isArray(data.stalls)||data.stalls.length>1000)throw new Error('market_unavailable');return data;});
    marketSnapshot.then(data=>{
      if(container.dataset.selectedPlayer!==item.id)return;
      const stalls=data.stalls.filter(v=>v.owner?.type==='PLAYER'&&(v.owner.id===item.id||v.owner.name?.toLowerCase()===item.name.toLowerCase()));
      note.textContent=stalls.length?stalls.length+' public stalls':'No public stalls in the latest snapshot.';
      for(const stall of stalls)market.append(link('market.html#stall='+encodeURIComponent(stall.id),stall.id+' - '+(stall.shops?.length??0)+' shops'));
    }).catch(()=>{note.textContent='Market data is unavailable.';marketSnapshot=null;});
    market.append(link('market.html#owner='+encodeURIComponent(item.name),'Open market'));
}
function appendPublicDetails(item,container){
  for(const [key,label] of [['guild','Guild'],['rank','Rank'],['hunter','Claimed by']])
    if(item[key])container.append(el('p',{text:label+': '+item[key]}));
  if(item.expiresAt)container.append(el('p',{text:'Expires: '+new Date(item.expiresAt).toLocaleString()}));
  for(const [key,label] of [['membersList','Members'],['achievements','Achievements']])
    if(item[key]?.length)container.append(el('h3',{text:label}),el('p',{text:item[key].join(', ')}));
}
function appendDetailHeading(item,container){
  container.replaceChildren(el('h2',{text:item.name??item.title}),markdown(item.description??item.body));
  if(item.banner&&window.EnthusiaGuildBannerRenderer)container.prepend(window.EnthusiaGuildBannerRenderer.create(item.banner,item.name+' banner'));
  if(item.image)container.append(el('img',{src:item.image,alt:item.title,loading:'lazy',style:'max-width:100%'}));
}
function appendDetailMetrics(item,container){
  const stats=el('div',{class:'community-stats'});
  for(const [key,label] of [['level','Level'],['members','Members'],['elo','ELO'],['gold','Raw gold'],['balance','Raw gold'],['playtime','Playtime'],['reputation','Reputation'],['completed','Completed']])if(key in item)stats.append(metric(label,item[key]));
  container.append(stats);
}
function detail(item,container){
  appendDetailHeading(item,container);
  appendDetailMetrics(item,container);
  appendPublicDetails(item,container);
  if(kind==='players')appendPlayerMarket(item,container);
  for(const target of item.links??[])container.append(link(target.url,target.label));
  if(item.target)container.append(link(item.target,'Open reference'));
  if(kind==='timeline')container.append(el('p',{text:item.verification==='verified'?'Source verified':'Historical entry awaiting source verification'}));
  const hash=item.slug??item.id;history.replaceState(null,'','#'+encodeURIComponent(hash));
}
function searchControls(items,render,directory){
  let q='',category='All',sort='name';
  const field=el('input',{type:'search',placeholder:'Search '+kind,'aria-label':'Search '+kind,oninput:event=>{q=event.target.value.toLowerCase();refresh();}});
  const select=el('select',{'aria-label':'Filter '+kind,onchange:event=>{category=event.target.value;refresh();}});
  const options=new Set(['All',...items.map(item=>item.category).filter(Boolean)]);
  if(kind==='guilds'){options.add('Recruiting');options.add('Peaceful');options.add('Hostile');}
  if(kind==='bounties')for(const x of ['open','claimed','expired'])options.add(x);
  for(const option of options)select.append(el('option',{value:option,text:option}));
  const sorter=el('select',{'aria-label':'Sort '+kind,onchange:event=>{sort=event.target.value;refresh();}},(directory?['name','level','elo','members','gold','playtime','balance']:['date','title']).map(value=>el('option',{value,text:value})));
  sort=directory?'name':'date';sorter.value=sort;
  host.append(el('div',{class:'community-toolbar'},[field,select,sorter]));
  const summary=status(host,'');
  function refresh(){let list=items.filter(item=>(item.name??item.title??'').toLowerCase().includes(q)&&(category==='All'||item.category===category||item.state===category||(category==='Recruiting'&&item.recruiting)||(category==='Peaceful'&&item.peaceful)||(category==='Hostile'&&item.peaceful===false)));
    list=list.sort((a,b)=>['name','title'].includes(sort)?String(a[sort]??'').localeCompare(String(b[sort]??'')):sort==='date'?Date.parse(b.date??0)-Date.parse(a.date??0):(b[sort]??-1)-(a[sort]??-1));
    summary.textContent=list.length+' of '+items.length+' shown';render(list);
  }return refresh;
}
function directory(items){
  const layout=el('div',{class:'community-layout'}),list=el('div',{class:'community-list'}),panel=el('aside',{class:'tip fret community-detail','aria-live':'polite'});
  const refresh=searchControls(items,rows=>{
    list.replaceChildren(...rows.map(item=>el('button',{type:'button',class:'community-row','aria-pressed':'false',onclick:event=>{for(const node of list.children)node.setAttribute('aria-pressed','false');event.currentTarget.setAttribute('aria-pressed','true');detail(item,panel);}},[el('span',{text:item.name}),el('span',{text:kind==='guilds'?'Level '+(item.level??'?'):kind==='bounties'?(item.gold??'?')+' raw gold':item.guild??item.category??''})])));
    if(!rows.length)list.append(el('p',{class:'community-empty',text:'No matching records.'}));
  },true);
  layout.append(list,panel);host.append(layout);refresh();
  const selected=decodeURIComponent(location.hash.slice(1));const item=items.find(v=>v.id===selected||v.name===selected)??items[0];if(item)detail(item,panel);
}
function collection(items){
  const grid=el('div',{class:'community-grid'}),panel=el('article',{class:'tip fret community-detail','aria-live':'polite'});
  const refresh=searchControls(items,rows=>{
    grid.replaceChildren(...rows.map(item=>el('article',{class:'community-card'},[item.image?el('img',{src:item.image,alt:item.title,loading:'lazy'}):null,el('p',{text:item.category??''}),el('h2',{text:item.title}),el('p',{text:item.date?new Date(item.date).toLocaleDateString():''}),el('p',{text:item.body?.slice(0,160)??''}),button('Read more',()=>{detail(item,panel);panel.scrollIntoView({behavior:'smooth',block:'start'});})])));
    if(!rows.length)grid.append(el('p',{class:'community-empty',text:'No published records yet.'}));
  },false);
  host.append(panel,grid);refresh();const selected=decodeURIComponent(location.hash.slice(1));const item=items.find(v=>v.slug===selected);if(item)detail(item,panel);
  if(kind==='museum')host.prepend(el('p',{class:'community-status',text:'Mapart Museum built by 0uzen. Published pieces appear here.'}));
}
async function polls(items){
  const grid=el('div',{class:'community-grid'});host.append(grid);
  for(const item of items){
    const card=el('article',{class:'tip fret community-card s-red'},[el('h2',{text:item.title}),markdown(item.body),el('p',{text:'Closes '+new Date(item.closesAt).toLocaleString()})]);grid.append(card);
    const feedback=status(card,'Loading ballot...');
    try{
      const data=await api('polls/'+encodeURIComponent(item.slug)),closed=Date.parse(item.closesAt)<=Date.now();
      feedback.textContent=closed?'Poll closed':'You can change your vote until closing. Results appear after closing.';
      for(const [index,option]of item.options.entries()){
        const votes=data.totals?.find(v=>v.choice===index)?.votes??0;
        const choice=button(option+(closed?' - '+votes+' votes':''),async()=>{
          choice.disabled=true;try{await api('polls/'+encodeURIComponent(item.slug),{method:'POST',body:JSON.stringify({choice:index})});feedback.textContent='Vote saved.';for(const b of card.querySelectorAll('[aria-pressed]'))b.setAttribute('aria-pressed','false');choice.setAttribute('aria-pressed','true');}catch(error){feedback.textContent=error.message;}finally{choice.disabled=false;}
        });choice.setAttribute('aria-pressed',data.choice===index);choice.disabled=closed;card.append(choice);
      }
    }catch(error){feedback.textContent=error.message;}
  }if(!items.length)status(host,'No published polls yet.');
  host.append(link('account.html','Sign in / link account'));
}
function field(form,label,type='text',value=''){
  const input=type==='textarea'?el('textarea'):el('input',{type});input.value=value;input.setAttribute('aria-label',label);form.append(el('label',{text:label},[input]));return input;
}
async function publishingEditor(){
  host.replaceChildren();const message=status(host,'Checking editor access...');
  try{await api('admin/session');}catch(error){message.textContent='Publishing requires an authorized staff account. '+error.message;host.append(link('account.html','Sign in'));return;}
  message.textContent='Drafts are private. Publish makes a record public. Existing polls lock their options after the first vote.';
  const form=el('form',{class:'community-form tip fret s-cream community-detail'}),preview=el('article',{class:'community-card'}),list=el('div',{class:'community-list'});
  let revision=0;
  const type=el('select',{'aria-label':'Record type'},kinds.map(value=>el('option',{value,text:value})));form.append(el('label',{text:'Record type'},[type]));
  const slug=field(form,'Slug'),title=field(form,'Title'),category=field(form,'Category'),date=field(form,'Date','datetime-local'),image=field(form,'Image URL'),target=field(form,'Reference URL'),tags=field(form,'Tags (comma separated)'),body=field(form,'Body (Discord formatting)','textarea'),options=field(form,'Poll options (one per line)','textarea'),closing=field(form,'Poll closes','datetime-local');
  const verification=el('select',{'aria-label':'Historical verification'},['unverified','verified'].map(value=>el('option',{value,text:value})));form.append(el('label',{text:'Historical verification'},[verification]));
  const toolbar=el('div',{class:'community-toolbar'});
  for(const [label,token]of [['Bold','**'],['Italic','*'],['Underline','__'],['Code','`'],['Spoiler','||']])toolbar.append(button(label,()=>{const a=body.selectionStart,b=body.selectionEnd;body.setRangeText(token+body.value.slice(a,b)+token,a,b,'select');body.dispatchEvent(new Event('input'));}));
  form.insertBefore(toolbar,body.parentElement);
  body.addEventListener('input',()=>preview.replaceChildren(el('h2',{text:title.value}),markdown(body.value)));
  const feedback=status(form,'');
  host.append(button('Import historical design drafts',async event=>{
    const importButton=event.currentTarget;
    importButton.disabled=true;
    try{
      const response=await fetch(new URL('./design-drafts.json',import.meta.url));if(!response.ok)throw new Error('Design drafts are unavailable.');
      const data=await response.json();let saved=0;
      const current=await api('admin/timeline'),existing=new Set(current.items.map(v=>v.slug));
      for(const item of data.items){if(existing.has(item.slug))continue;await api('admin/timeline',{method:'POST',body:JSON.stringify({...item,status:'draft',verification:'unverified',revision:0})});saved++;}
      message.textContent=saved+' historical drafts imported. Review each source and date before publishing.';type.value='timeline';await reload();
    }catch(error){message.textContent=error.message;}finally{importButton.disabled=false;}
  }));
  function load(item){revision=item.revision??0;slug.value=item.slug??'';title.value=item.title??'';category.value=item.category??'';body.value=item.body??'';date.value=item.date?item.date.slice(0,16):'';image.value=item.image??'';target.value=item.target??'';tags.value=(item.tags??[]).join(', ');options.value=(item.options??[]).join('\n');closing.value=item.closesAt?item.closesAt.slice(0,16):'';verification.value=item.verification??'unverified';feedback.textContent='Revision '+revision+' - '+(item.status??'new');body.dispatchEvent(new Event('input'));}
  async function reload(){const data=await api('admin/'+type.value);list.replaceChildren(button('New record',()=>load({})),...data.items.map(item=>button(item.title+' ['+item.status+']',()=>load(item),'community-row')));}
  async function save(state){
    const buttons=form.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
    try{const result=await api('admin/'+type.value,{method:'POST',body:JSON.stringify({kind:type.value,slug:slug.value,title:title.value,body:body.value,category:category.value,date:date.value?new Date(date.value+'Z').toISOString():null,image:image.value,target:target.value,tags:tags.value.split(',').map(v=>v.trim()).filter(Boolean),options:options.value.split('\n').filter(Boolean),closesAt:closing.value?new Date(closing.value+'Z').toISOString():null,verification:verification.value,status:state,revision})});load(result);feedback.textContent='Saved as '+state+'.';await reload();}catch(error){feedback.textContent=error.message;}finally{buttons.forEach(b=>b.disabled=false);}
  }
  form.append(el('p',{text:'Dates above use UTC.'}),el('div',{class:'actions'},[button('Save draft',()=>save('draft')),button('Publish',()=>save('published')),button('Archive',()=>save('archived'))]));
  form.addEventListener('submit',event=>event.preventDefault());type.addEventListener('change',()=>{load({});reload().catch(error=>feedback.textContent=error.message);});
  host.append(list,el('div',{class:'community-layout'},[form,preview]));await reload();
}
function store(){
  host.replaceChildren(el('h2',{text:'Choose your rank'}),el('p',{class:'community-status',text:'Package availability, prices and checkout are provided by Tebex.'}));
  const url=window.ENTHUSIA?.tebexUrl??'https://enthusia-shop.tebex.io/';
  host.append(el('div',{class:'community-grid'},[
    el('article',{class:'tip fret community-card s-red'},[el('h2',{text:'Avid'}),el('p',{text:'Signed items, item chat previews and cosmetic commands. Check the current package for exact perks.'}),link(url,'View Avid on Tebex')]),
    el('article',{class:'tip fret community-card s-red'},[el('h2',{text:'Devotee'}),el('p',{text:'Mapart shields, inventory previews and additional cosmetic features. /events and /start koth perks return alongside those systems.'}),link(url,'View Devotee on Tebex')]),
    el('article',{class:'community-card'},[el('h2',{text:'Glorious holders'}),el('p',{text:'ToxikFlame11, Summars, Qaysoz'})])
  ]),el('p',{text:'Enter your exact Minecraft username on Tebex, read the package details and complete payment there.'}));
}
async function start(){
  if(!host)return;
  if(kind==='newseditor'){await publishingEditor();return;}if(kind==='store'){store();return;}
  host.replaceChildren();
  try{const data=await api(kind);status(host,data.limited?'Guild leaderboard data. Full roster, recruitment and ELO have not been exported.':data.stale?'Last server export is stale. Values may have changed.':data.updatedAt?'Updated '+new Date(data.updatedAt).toLocaleString():'Published community records');if(snapshots.has(kind)&&!data.curated)directory(data.items);else if(kind==='polls')await polls(data.items);else collection(data.items);}catch(error){status(host,error.message);host.append(button('Retry',start));}
}
start().catch(error=>{host.replaceChildren();status(host,error.message);});
