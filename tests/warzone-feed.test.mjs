import test from 'node:test';
import assert from 'node:assert/strict';
import {projectSnapshot,verifyProducer} from '../functions/lib/community/contracts.js';
import {weeklyDuelLeaders} from '../public/assets/warzone-view.js';

test('weekly duel leaders use match wins, reject fractional counts and strip private match data',()=>{
  const snapshot=projectSnapshot('warzone',{items:[{id:'b',name:'B',type:'leader',wins:3,kills:99,wager:100},{id:'a',name:'A',type:'leader',wins:3},{id:'c',name:'C',type:'leader',kills:500}]});
  assert.deepEqual(weeklyDuelLeaders(snapshot.items).map(row=>row.id),['a','b']);
  assert.equal(snapshot.items[0].wins,3);
  assert.equal('wager' in snapshot.items[0],false);
  assert.throws(()=>projectSnapshot('warzone',{items:[{id:'a',name:'A',type:'leader',wins:1.5}]}),/invalid_wins/);
  assert.throws(()=>projectSnapshot('warzone',{items:[{id:'a',name:'A',type:'leader',wins:-1}]}));
});

test('website accepts the independent Java HMAC contract and rejects tampering',async()=>{
  const body='{"kind":"warzone"}';
  const request=new Request('https://example.com/api/community/ingest',{method:'POST',body,headers:{'x-enthusia-timestamp':'1791806400000','x-enthusia-nonce':'0123456789abcdef','x-enthusia-signature':'3000b6248e8288d60be1fc937b13ebd2df339d1c1fa7195716ef2461f7fda210'}});
  assert.equal(await verifyProducer(request,{COMMUNITY_INGEST_SECRET:'s'.repeat(32)},body,1791806400000),true);
  assert.equal(await verifyProducer(request,{COMMUNITY_INGEST_SECRET:'s'.repeat(32)},body+' ',1791806400000),false);
});

 test('live duel metadata survives projection and rejects a mislabeled week',()=>{
  const now=new Date(),week=new Date(now);week.setUTCHours(0,0,0,0);week.setUTCDate(week.getUTCDate()-((week.getUTCDay()+6)%7));
  const input={items:[],generatedAt:now.toISOString(),weekStartsAt:week.toISOString(),duelResultsComplete:true,duelUpdatedAt:now.toISOString()};
  const result=projectSnapshot('warzone',input);
  assert.equal(result.weekStartsAt,input.weekStartsAt);assert.equal(result.duelResultsComplete,true);
  assert.throws(()=>projectSnapshot('warzone',{...input,weekStartsAt:new Date(week.getTime()-86400000).toISOString()}));
 });
