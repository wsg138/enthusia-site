import { playerHead } from './exact-player-profile.js';
import { api, el } from './community-dom.js';
import { saleItemName } from './market/history-model.js';

const header = document.querySelector('.site-head-in');
if (header) install(header);

function install(header) {
  const root = new URL('.', header.querySelector('.brand').href);
  const preview = document.documentElement.hasAttribute('data-preview-root');
  const groups = new Map();
  const identities = new Map();
  const typed = {players:new Map(),guilds:new Map()};
  const pages = new Map();
  for (const a of header.querySelectorAll('nav a[href]')) {
    if (a.origin !== location.origin || a.closest('[data-staff-link]')) continue;
    pages.set(a.href, a.textContent.trim());
  }
  for (const [path, label] of [['index.html','Home'],['join.html#commands','Player guide · Commands'],['join.html#warzone','Warzone rules and rotations'],['join.html#join-faq-title','Joining FAQ']]) {
    pages.set(new URL(path, root).href, label);
  }
  if (preview) pages.set(new URL('guildquests.html', root).href, 'Weekly Guild Quests');
  if (preview) pages.set(new URL('prestige.html', root).href, 'Hall of Prestige');
  groups.set('Pages and guides', Array.from(pages, ([href, name]) => ({href, name})));

  const trigger = el('button', {type:'button',class:'site-search-trigger','aria-label':'Search site','aria-haspopup':'dialog',title:'Search site (/)'});
  trigger.append(el('span', {class:'site-search-glass','aria-hidden':'true'}));
  header.querySelector('.hdr-play')?.before(trigger);
  if (!trigger.isConnected) header.append(trigger);
  const dialog = el('dialog', {class:'site-search-dialog','aria-labelledby':'site-search-title'});
  const input = el('input', {type:'search',placeholder:'Search players, guilds, items, or pages', 'aria-label':'Search site',autocomplete:'off'});
  const close = el('button',{type:'button',class:'btn btn-gold',text:'Close',onclick:()=>dialog.close()});
  const results = el('div',{class:'site-search-results'});
  const status = el('p', {role:'status'});
  dialog.append(el('div',{class:'site-search-top'},[el('h2',{id:'site-search-title',text:'Search Enthusia'}),close]),input,status,results);
  (header.closest('.en') || document.body).append(dialog);
  let started=false, pending=0, failed=0;
  function resultLink(row) {
    const link = el('a',{href:row.href,text:row.name});
    if (row.player) {
      const head = playerHead(row.player, 32);
      head.alt = '';
      link.className = 'player-search-result';
      link.prepend(head);
    }
    return link;
  }
  function draw() {
    if (!dialog.open) return;
    const q = input.value.trim().toLowerCase();
    results.replaceChildren();
    let count = 0;
    for (const [category, rows] of groups) {
      if (!q && category !== 'Pages and guides') continue;
      const matching = rows.filter(row => row.name.toLowerCase().includes(q));
      matching.sort((a,b)=>Number(b.name.toLowerCase().startsWith(q))-Number(a.name.toLowerCase().startsWith(q)));
      const shown = matching.slice(0, q ? 8 : 6);
      if (!shown.length) continue;
      count += shown.length;
      results.append(el('section',{},[el('h3',{text:category}),...shown.map(resultLink)]));
    }
    status.textContent = [!count && (pending?'Searching…':'No matches.'), failed && 'Some public listings are unavailable.'].filter(Boolean).join(' ');
  }
  async function load(group, read) {
    pending++;
    try { groups.set(group, await read()); } catch { failed++; }
    finally { pending--; draw(); }
  }
  const publicFeed = kind => api(kind,{signal:AbortSignal.timeout(6000)});
  const entry = (name,path) => ({name,href:new URL(path,root).href});
  function more() {
    if (started) return;
    started=true;
    load('Guide commands',async()=>{
      const url=new URL('join.html',root);
      const response=await fetch(url,{signal:AbortSignal.timeout(6000)});
      if(!response.ok)throw new Error();
      const page=new DOMParser().parseFromString(await response.text(),'text/html');
      return Array.from(page.querySelectorAll('#commands .cmd'),cmd=>entry(cmd.textContent.trim(),'join.html#commands'));
    });
    load('Market items',async()=>{
      const data=await publicFeed(preview?'market-design':'insights');
      return (preview?data.items.map(v=>v.name):data.prices.map(v=>saleItemName(v.item))).map(name=>entry(name,'market.html#item='+encodeURIComponent(name)));
    });
    load('News',async()=> (await publicFeed('news')).items.map(post=>entry(post.title,(preview?'news.html#':'news/')+encodeURIComponent(post.slug))));
    load('Events and competitions',async()=>{
      const res=await fetch('/api/competitions',{signal:AbortSignal.timeout(6000)});
      if(!res.ok) throw new Error();
      return (await res.json()).competitions.map(c=>entry(c.title,'competitions/detail.html?competition='+encodeURIComponent(c.slug)));
    });
  }
  function open(){ dialog.showModal(); input.focus(); more(); draw(); }
  trigger.addEventListener('click',open);
  input.addEventListener('input',draw);
  input.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();results.querySelector('a')?.focus();}});
  dialog.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();dialog.close();}
  });
  dialog.addEventListener('close',()=>trigger.focus());
  document.addEventListener('keydown',e=>{
    if(e.key==='/' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey && !dialog.open && !document.querySelector('dialog[open]') && !e.target.closest('input,textarea,select,[contenteditable]')){
      e.preventDefault();open();
    }
  });
  const main=document.querySelector('main');
  const labels='span,strong,b,small,h2,h3,h4,p,td,dd,li';
  function linkLabel(node) {
    if(!node.matches(labels)||node.childElementCount||node.closest('a,button,label,dialog,form,[contenteditable],.release-body,.news-body,code'))return;
    const name=node.textContent.trim();
    const staff=node.closest('.staff-info');
    const account = staff && node.matches('h3,p span')
      ? staff.querySelector('a[href*="laby.net/@"]')?.href.split('@').pop() : null;
    if(staff && node.matches('p span') && !node.parentElement.textContent.trim().startsWith('Minecraft'))return;
    const founder=name==='Fain' && node.matches('[data-author-name]') && node.parentElement.textContent.includes('Founder');
    const identity=node.dataset.profileKey || account || (founder?'FainNeito':name);
    let match=identities.get(identity.toLowerCase());
    const kind=node.dataset.profileKind || (account || node.matches('.wz-player,.who span') ? 'players' : node.matches('.quest-rank-name') ? 'guilds' : '');
    if(kind) match=typed[kind].get(identity.toLowerCase()) || entry(name,kind+'.html#'+encodeURIComponent(identity)).href;
    if(!name||!match)return;
    node.replaceChildren(el('a',{href:match,class:'identity-link',text:name}));
  }
  function scan(node){
    if(!node||node.nodeType!==1||node.closest('a,button,dialog,form'))return;
    linkLabel(node);for(const child of node.querySelectorAll(labels))linkLabel(child);
  }
  const directories = [['players','Players'],['guilds','Guilds']].map(([kind,group])=>
    load(group,async()=>{
      const rows=(await publicFeed(kind)).items.map(v=>{
        const row=entry(v.name,kind+'.html#'+encodeURIComponent(v.id));
        if(kind==='players') row.player=v;
        for(const key of new Set([v.name,v.id])) {
          if(!key)continue;
          const k=String(key).toLowerCase();
          typed[kind].set(k,row.href);
          identities.set(k,identities.has(k)&&identities.get(k)!==row.href?null:row.href);
        }
        return row;
      });
      return rows;
    }));
  // Resolve labels after both directories settle, including names rendered by later feed updates.
  Promise.all(directories).then(()=>{
    if(!main)return;
    scan(main);
    const observer=new MutationObserver(records=>{
      for(const record of records)for(const node of record.addedNodes)scan(node.nodeType===3?node.parentElement:node);
    });
    observer.observe(main,{childList:true,subtree:true});
  });
}
