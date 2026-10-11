import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function loadFunction(file, name, next) {
  const source=readFileSync(new URL('../public/assets/'+file, import.meta.url),'utf8');
  const start=source.indexOf('async function '+name+'(');
  const end=source.indexOf('\nfunction '+next+'(',start);
  assert.ok(start>=0 && end>start);
  const calls=[];
  const context={fetch: async url=>{calls.push(url);return {ok:true,status:200,json:async()=>({})};},setDisabled(){},refreshButton:{click(){}}};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);
  return {fn:context[name],calls};
}
test('punishment binding requests reject destinations outside the two local routes',async()=>{
  const {fn,calls}=loadFunction('account-punishments.js','api','stateText');
  for(const route of ['https://evil.example','//evil.example','/api/appeals/bindings?override=1','../bindings']) await assert.rejects(fn(route),/Unsupported/);
  assert.equal(calls.length,0);
  await fn('/api/appeals/bindings');await fn('/api/appeals/revalidate',{method:'POST'});
  assert.deepEqual(calls,['/api/appeals/bindings','/api/appeals/revalidate']);
});
test('lifecycle requests reject invalid identifiers and actions before fetching',async()=>{
  const {fn,calls}=loadFunction('reviewer-appeals-lifecycle.js','postLifecycle','claimControls');
  const status={};
  const id='123e4567-e89b-12d3-a456-426614174099';
  for(const [value,action] of [['../other','claim'],[id,'../other'],[id+'?override=1','reopen']]) await fn({id:value},action,{},null,status);
  assert.equal(calls.length,0);
  for(const action of ['claim','reopen'])await fn({id},action,{},null,status);
  assert.deepEqual(calls,[
    '/api/reviewer/appeals/'+id+'/claim',
    '/api/reviewer/appeals/'+id+'/reopen'
  ]);
});

