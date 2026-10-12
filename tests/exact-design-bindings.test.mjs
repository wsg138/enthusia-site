import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
test('design events only dispatch actions explicitly returned by their controller',async()=>{
  const listeners=new Map(),document={readyState:'complete',querySelectorAll:()=>[],addEventListener:(name,fn)=>listeners.set(name,fn)};
  const window={},calls=[];
  vm.runInNewContext(await readFile(new URL('../public/assets/design-bindings.js',import.meta.url),'utf8'),{document,window});
  class Controller{renderVals(){return Object.assign(Object.create({inherited:()=>calls.push('inherited')}),{declared:()=>calls.push('declared')});}}
  window.EnthusiaDesign.mount(Controller,{});
  const click=name=>listeners.get('click')({target:{getAttribute:()=>name,parentNode:document}});
  click('inherited');click('constructor');assert.deepEqual(calls,[]);click('declared');assert.deepEqual(calls,['declared']);
});
