import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('sample preview intercepts API reads and blocks every write without reaching a backend', async () => {
  const calls=[];
  const data=JSON.parse(await readFile(new URL('../public/preview/data.json',import.meta.url),'utf8'));
  const market=JSON.parse(await readFile(new URL('../public/assets/market/sample-market-snapshot.json',import.meta.url),'utf8'));
  const node=()=>({append(){},prepend(){},addEventListener(){},setAttribute(){},textContent:''});
  const context={URL,Request,Response,location:{href:'https://preview.example/preview/index.html',origin:'https://preview.example',reload(){}},sessionStorage:{getItem(){return 'player';},setItem(){}},queueMicrotask,document:{currentScript:{src:'https://preview.example/preview/fixtures.js'},body:node(),createElement:node,addEventListener(){}},Option:class {constructor(text,value){this.text=text;this.value=value;}},window:{fetch:async url=>{calls.push(String(url));return Response.json(String(url).endsWith('data.json')?data:market);}}};
  vm.runInNewContext(await readFile(new URL('../public/preview/fixtures.js',import.meta.url),'utf8'),context);
  const list=await context.window.fetch('/api/competitions').then(r=>r.json());
  assert.equal(list.competitions.length,4);
  for(const method of ['POST','PUT','PATCH','DELETE']) {
    const response=await context.window.fetch('/api/competitions/admin',{method,body:'private sample input'});
    assert.equal(response.status,501);
    assert.equal((await response.json()).error,'preview_actions_are_not_saved');
  }
  assert.equal((await context.window.fetch('/api/competitions/admin')).status,403);
  assert.equal(calls.length,2);
  assert.ok(calls.every(url=>!url.includes('/api/')));
});
