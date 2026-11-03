import test from 'node:test';
import assert from 'node:assert/strict';
import { readCommunityUpstream,readPlayerAchievements } from '../functions/lib/community/upstream.js';
const at=new Date(Date.now()-60000).toISOString();
test('player achievement batches reject missing tokens, stale data and identities outside the request',async()=>{
  const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const env={COMMUNITY_PLAYER_ACHIEVEMENTS_API_URL:'https://api.example/players',COMMUNITY_PLAYER_ACHIEVEMENTS_API_TOKEN:'x'.repeat(32)};
  let calls=0;const fetcher=async()=>{calls++;return Response.json({generatedAt:at,items:[]});};
  assert.equal(await readPlayerAchievements([id],{...env,COMMUNITY_PLAYER_ACHIEVEMENTS_API_TOKEN:''},fetcher),null);assert.equal(calls,0);
  for(const payload of [{generatedAt:new Date(Date.now()-3600000).toISOString(),items:[]},{generatedAt:at,items:[{id:other,achievementsKnown:true,achievements:[]}]},{generatedAt:at,items:[{id,achievementsKnown:false,achievements:[]}]}])
    assert.equal(await readPlayerAchievements([id],env,async()=>Response.json(payload)),null);
});
test('configured real feeds are bounded and projected without private fields',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{calls.push({url:String(url),options});return Response.json({generatedAt:at,items:[{id:'player',name:'Player',balance:4,ip:'private'}]});};
  const env={COMMUNITY_PLAYERS_API_URL:'https://api.example/export',COMMUNITY_PLAYERS_API_TOKEN:'test-token'};
  const result=await readCommunityUpstream('players',env,fetchImpl);
  assert.equal(result.items[0].balance,4);assert.equal(result.source,'configured_upstream');
  assert.equal(JSON.stringify(result).includes('private'),false);assert.equal(calls[0].options.headers.authorization,'Bearer test-token');
  assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.method,'GET');
});
test('missing configuration and unsafe destinations are rejected before fetch',async()=>{
  let calls=0;const fetchImpl=()=>{calls++;throw new Error('not expected');};
  for(const url of [undefined,'http://api.example/export','https://user:password@api.example/export','https://api.example/export#fragment','https://127.0.0.1/export','https://localhost/export']){
    assert.equal(await readCommunityUpstream('players',{COMMUNITY_PLAYERS_API_URL:url},fetchImpl),null);
  }
  assert.equal(await readCommunityUpstream('../secret',{COMMUNITY_PLAYERS_API_URL:'https://api.example'},fetchImpl),null);
  assert.equal(calls,0);
});
test('broken, oversized, invalid and future feeds stay unavailable',async()=>{
  const env={COMMUNITY_PLAYERS_API_URL:'https://api.example/export'};
  for(const response of [new Response('no',{status:503}),new Response('not json'),new Response('x'.repeat(150001)),Response.json({generatedAt:new Date(Date.now()+3600000).toISOString(),items:[]}),Response.json({generatedAt:at,items:[{id:'a',name:'a',balance:-1}]})]){
    assert.equal(await readCommunityUpstream('players',env,async()=>response),null);
  }
  assert.equal(await readCommunityUpstream('players',env,async()=>{throw new Error('network');}),null);
});
test('source timestamp labels stale exports instead of resetting freshness at request time',async()=>{
  const generatedAt=new Date(Date.now()-3600000).toISOString();
  const result=await readCommunityUpstream('bounties',{COMMUNITY_BOUNTIES_API_URL:'https://api.example/export'},async()=>Response.json({generatedAt,items:[]}));
  assert.equal(result.updatedAt,generatedAt);assert.equal(result.stale,true);assert.deepEqual(result.items,[]);
});
