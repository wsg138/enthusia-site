import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshPublicFeed} from '../public/assets/live-feed-refresh.js';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
  const document=new EventTarget(),events=new EventTarget(),timers=new Map();document.visibilityState='visible';
  let id=0;return {document,events,timers,setTimeout:(fn,delay)=>{timers.set(++id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id)};
}
test('visible refresh avoids overlap, aborts on hide, resumes and cleans up navigation',async()=>{
  const env=harness(),pending=[],updates=[],errors=[];
  const feed=refreshPublicFeed(signal=>new Promise((resolve,reject)=>{pending.push({resolve,signal});signal.addEventListener('abort',()=>reject(new Error('aborted')));}),data=>updates.push(data),error=>errors.push(error),env);
  feed.refresh();assert.equal(pending.length,1);
  env.document.visibilityState='hidden';env.document.dispatchEvent(new Event('visibilitychange'));await settle();
  assert.equal(pending[0].signal.aborted,true);assert.equal(env.timers.size,0);assert.equal(errors.length,0);
  env.document.visibilityState='visible';env.document.dispatchEvent(new Event('visibilitychange'));assert.equal(pending.length,2);
  pending[1].resolve({wins:4});await settle();assert.deepEqual(updates,[{wins:4}]);
  assert.equal([...env.timers.values()].filter(t=>t.delay===60000).length,1);
  env.events.dispatchEvent(new Event('pagehide'));feed.refresh();env.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(pending.length,2);assert.equal(env.timers.size,0);
});
test('request timeout reports unavailable and schedules another attempt; bfcache resumes',async()=>{
  const env=harness();let errors=0,calls=0;
  const feed=refreshPublicFeed(signal=>{calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout'))));},()=>{},()=>errors++,env);
  [...env.timers.values()].find(t=>t.delay===5000).fn();await settle();assert.equal(errors,1);
  const hide=new Event('pagehide');Object.defineProperty(hide,'persisted',{value:true});env.events.dispatchEvent(hide);
  const show=new Event('pageshow');Object.defineProperty(show,'persisted',{value:true});env.events.dispatchEvent(show);assert.equal(calls,2);
  feed.stop();await settle();assert.equal(errors,1);assert.equal(env.timers.size,0);
});
