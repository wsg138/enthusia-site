import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {orderNewsPosts} from '../public/assets/news-order.js';
class Node {
  constructor(dataset={}){this.dataset=dataset;this.attributes=[];this.children=[];this.events={};this.hidden=false;this.textContent='';}
  setAttribute(k,v){this[k]=v;}
  removeAttribute(){}
  addEventListener(k,fn){this.events[k]=fn;}
  querySelectorAll(selector){return selector==='.postbtn'?this.children:[];}
  cloneNode(){const n=new Node();n.children=[new Node(),new Node(),new Node()];return n;}
  replaceChildren(...children){this.children=children;}
  append(child){this.children.push(child);}
}
test('news ordering controls and category filtering update the actual reader without losing selection',async()=>{
  const list=new Node(),panel=new Node(),template={content:{firstElementChild:new Node()},parentElement:{firstElementChild:list}};
  const newest=new Node({newsOrder:'newest'}),oldest=new Node({newsOrder:'oldest'}),all=new Node({onClick:'pickKAll'}),event=new Node({onClick:'pickKEvent'});
  const categoryGroup={children:[all,event]};all.parentElement=categoryGroup;event.parentElement=categoryGroup;
  const tag=new Node(),other=new Node();panel.querySelectorAll=()=>[];
  const selectors={'#news-row-template':template,'article.panel.swap':panel,'[data-on-click="pickKAll"]':all,'[data-b-class="tag {{postTag}}"]':tag};
  const document={body:{dataset:{exactPage:'news'}},documentElement:{hasAttribute:()=>true},querySelector:s=>selectors[s]??other,
    querySelectorAll:s=>s==='[data-news-order]'?[newest,oldest]:s==='[data-on-click^="pickK"]'?[all,event]:[]};
  const posts=[{slug:'older',title:'Older',category:'Event',date:'2024-01-01'}, {slug:'newer',title:'Newer',category:'Event',date:'2026-01-01'}, {slug:'middle',title:'Middle',category:'Announcement',date:'2025-01-01'}];
  let code=await readFile(new URL('../public/assets/exact-news.js',import.meta.url),'utf8');
  code=code.replace(/^import .*;\r?\n/gm,'').replace(/\(page===.*\n?$/,'');
  const context={document,orderNewsPosts,api:async()=>({items:posts}),el:()=>new Node(),formattedDate:s=>s,renderMarkup:()=>{},notice:()=>{},history:{replaceState(){}},location:{hash:'',href:'https://example.test/'},navigator:{},URL,URLSearchParams,releaseHistory:()=>()=>{},console};
  await vm.runInNewContext(code+'\nreader()',context);
  assert.deepEqual(list.children.map(x=>x.dataset.slug),['newer','middle','older']);
  list.children[1].events.click();
  oldest.events.click();
  assert.deepEqual(list.children.map(x=>x.dataset.slug),['older','middle','newer']);
  assert.equal(oldest['aria-pressed'],'true');assert.equal(list.children[1]['aria-pressed'],'true');
  event.events.click();
  assert.deepEqual(list.children.map(x=>x.dataset.slug),['older','newer']);
  newest.events.click();
  assert.deepEqual(list.children.map(x=>x.dataset.slug),['newer','older']);
});

test('News uses the founder’s Minecraft skin while preserving the Fain byline', async () => {
  const image = {}, rank = {};
  const name = { parentElement: { querySelector: () => image } };
  const document = {
    body: { dataset: {} },
    documentElement: { hasAttribute: () => false },
    querySelector: selector => selector === '[data-author-name]' ? name : rank
  };
  const source = await readFile(new URL('../public/assets/exact-news.js', import.meta.url), 'utf8');
  const code = source.trimEnd().replace(/^import .*;\r?\n/gm, '').replace(/\(page===.*\n?$/, '');
  const context = vm.createContext({ document });
  const renderAuthor = vm.runInContext(code + '\nauthor', context);
  renderAuthor({ authorName: 'Fain', authorRank: 'Founder' });
  assert.equal(image.src, 'https://minotar.net/helm/FainNeito/40');
  assert.equal(name.textContent, 'Fain');
  assert.equal(rank.textContent, 'Founder');
  renderAuthor({ authorName: 'Fain', authorRank: 'Admin' });
  assert.equal(image.src, 'https://minotar.net/helm/Fain/40');
  renderAuthor({ authorName: 'FainNeito', authorRank: 'Founder' });
  assert.equal(image.src, 'https://minotar.net/helm/FainNeito/40');
});
