import test from 'node:test';
import assert from 'node:assert/strict';
import { publicRecord, validateRecord, projectSnapshot, validateSale, pollOpen, verifyProducer } from '../functions/lib/community/contracts.js';

test('public content strips drafts, actor identity and private metadata', () => {
  assert.equal(publicRecord({ status: 'draft' }), null);
  const row = publicRecord({status:'published',slug:'test',kind:'news',title:'News',body:'safe',revision:1,editor:'secret',payload:'{"ip":"private"}'});
  assert.equal(JSON.stringify(row).includes('secret'), false);
  assert.equal(JSON.stringify(row).includes('private'), false);
});
test('record validation bounds bodies, links, timestamps and poll options', () => {
  assert.throws(()=>validateRecord({kind:'news',slug:'bad',title:'X',body:'x',image:'javascript:alert(1)'}));
  assert.throws(()=>validateRecord({kind:'polls',slug:'poll',title:'Pick',options:['one','one'],closesAt:'bad'}));
  assert.equal(validateRecord({kind:'news',slug:'ok',title:'Title',body:'**Hi**',status:'draft'}).body,'**Hi**');
});
test('public server snapshots discard private fields and reject invented/invalid values', () => {
  const out = projectSnapshot('guilds',{items:[{id:'g1',name:'Guild',level:3,members:5,elo:1200,recruiting:true,home:{x:1},ip:'secret',balance:99}]});
  assert.deepEqual(out.items[0],{id:'g1',name:'Guild',description:'',level:3,members:5,elo:1200,prestige:null,foundedAt:null,bankBalance:null,totalExperience:null,activityScore:null,tag:'',recruiting:true,peaceful:null,membersList:[],banner:null,links:[]});
  assert.throws(()=>projectSnapshot('guilds',{items:[{id:'g',name:'G',level:-1}]}));
});
test('ballot acceptance uses server close time and publication state', () => {
  const p={status:'published',closesAt:'2026-10-11T12:00:00Z'};
  assert.equal(pollOpen(p,Date.parse('2026-10-11T11:59:59Z')),true);
  assert.equal(pollOpen(p,Date.parse(p.closesAt)),false);
  assert.equal(pollOpen({...p,status:'draft'},0),false);
});
test('sales require actual positive quantities and raw gold with canonical identifiers', () => {
  assert.throws(()=>validateSale({id:'s1',stall:'A',item:'stone',quantity:0,gold:1,occurredAt:'2026-10-11'}));
  assert.throws(()=>validateSale({id:'s1',stall:'A',item:'stone',quantity:2,gold:Infinity,occurredAt:'2026-10-11'}));
  assert.equal(validateSale({id:'s1',stall:'A',item:'stone',quantity:2,gold:1,occurredAt:'2026-10-11T00:00:00Z'}).gold,1);
});
test('producer authorization fails closed without key, signature, or recent timestamp', async () => {
  assert.equal(await verifyProducer(new Request('https://example.com/api/community/ingest',{method:'POST'}),{},'{}'),false);
});

test('Warzone exports expose only public kit, leaderboard and activity fields',()=>{
 const value=projectSnapshot('warzone',{items:[{id:'kit',name:'Current kit',description:'Public rules',type:'kit',endsAt:'2026-10-12T12:00:00Z',secretCoordinates:'private',internalId:'secret'}]});
 assert.equal(value.items[0].type,'kit');assert.equal(value.items[0].endsAt,'2026-10-12T12:00:00.000Z');assert.equal(value.items[0].secretCoordinates,undefined);assert.equal(value.items[0].internalId,undefined);
 assert.throws(()=>projectSnapshot('warzone',{items:[{id:'bad',name:'Unknown',type:'private'}]}),/invalid_warzone_type/);
});
