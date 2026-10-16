import test from 'node:test';
import assert from 'node:assert/strict';
import {readPublicPlayerDirectory} from '../functions/lib/player-directory-source.js';
import {ownedPlayerStalls} from '../public/assets/player-market-model.js';
const id='10000000-0000-4000-8000-000000000001',guild='20000000-0000-4000-8000-000000000002';
const board={generatedAt:new Date().toISOString(),players:[{uuid:id,username:'Player',value:42,rank:3}]};
const env={BALANCE_LEADERBOARDS:{get:async()=>({json:async()=>board})},COMMUNITY_PLAYER_GUILDS_API_URL:'https://guilds.example/api/community/player-guilds',COMMUNITY_PLAYER_GUILDS_API_TOKEN:'test-only'};
test('UUID guild associations and actual board positions survive public projection without private data',async()=>{
  const data=await readPublicPlayerDirectory(env,Date.now(),async url=>{
    assert.equal(url.searchParams.get('players'),id);
    return Response.json({generatedAt:new Date().toISOString(),items:[{id,guildMemberships:[{id:guild,name:'Guild',level:100,homes:'private',membersList:['private']}]}]});
  });
  const player=data.items[0];assert.equal(player.balanceRank,3);assert.equal(player.guildsKnown,true);assert.equal(player.guildMemberships[0].name,'Guild');
  assert.equal(JSON.stringify(data).includes('private'),false);
});
test('missing lookup is unknown while a successful empty lookup is an explicit no-guild result',async()=>{
  const failed=await readPublicPlayerDirectory(env,Date.now(),async()=>{throw new Error('unavailable')});
  assert.equal(failed.items[0].guildsKnown,undefined);assert.equal(failed.items[0].balance,42);
  const empty=await readPublicPlayerDirectory(env,Date.now(),async()=>Response.json({generatedAt:new Date().toISOString(),items:[{id,guildMemberships:[]}]}));
  assert.equal(empty.items[0].guildsKnown,true);assert.deepEqual(empty.items[0].guildMemberships,[]);
});
test('market ownership matches UUID rather than names, guild membership or delegated access',()=>{
  const data={stalls:[{id:'A',owner:{type:'PLAYER',uuid:id},members:['Someone'],shops:[{direction:'SELL'}]},
    {id:'B',owner:{type:'GUILD',uuid:guild},members:['Player'],shops:[]},
    {id:'C',owner:{type:'PLAYER',uuid:guild,name:'Player'},shops:[]}]};
  assert.deepEqual(ownedPlayerStalls(data,{id,name:'Player'}),[{id:'A',shops:1,types:['Selling']}]);
});
test('new guild captures can refresh unchanged boards while their old stats remain labeled stale',async()=>{
  const old=new Date(Date.now()-3600000).toISOString(),now=Date.now();
  const inputs={...env,BALANCE_LEADERBOARDS:{get:async()=>({json:async()=>({...board,generatedAt:old})})}};
  let stamp=new Date(now).toISOString(),name='First guild';
  const fetcher=async()=>Response.json({generatedAt:stamp,items:[{id,guildMemberships:[{id:guild,name}]}]});
  const first=await readPublicPlayerDirectory(inputs,now,fetcher);
  stamp=new Date(now+1000).toISOString();name='New guild';
  const next=await readPublicPlayerDirectory(inputs,now+1000,fetcher);
  assert.equal(next.sourceUpdatedAt,old);assert.equal(next.stale,true);assert.ok(next.generatedAt>first.generatedAt);
  assert.equal(next.items[0].balance,42);assert.equal(next.items[0].guildMemberships[0].name,'New guild');
});
