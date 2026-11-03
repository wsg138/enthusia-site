import test from 'node:test';
import assert from 'node:assert/strict';
import { readPublicPlayerDirectory } from '../functions/lib/player-directory-source.js';
const a='02f2a966-6e38-4583-9d57-a04f8984af35',b='0a51c4ef-89b4-4560-ac2f-1f554ae28add';
const now=Date.now(),at=new Date(now-60000).toISOString();
const bucket=data=>({get:async()=>({json:async()=>data})});
test('achievement export joins only returned players and preserves unknown for omitted players',async()=>{
  const env={BALANCE_LEADERBOARDS:bucket({generatedAt:at,players:[{uuid:a,username:'Player',value:1},{uuid:b,username:'Other',value:2}]}),COMMUNITY_PLAYER_ACHIEVEMENTS_API_URL:'https://api.example/players',COMMUNITY_PLAYER_ACHIEVEMENTS_API_TOKEN:'x'.repeat(32)};
  const result=await readPublicPlayerDirectory(env,now,async(url,options)=>{
    assert.equal(options.headers.authorization,'Bearer '+'x'.repeat(32));
    assert.deepEqual(new URL(url).searchParams.get('players').split(',').sort(),[a,b].sort());
    return Response.json({generatedAt:at,items:[{id:a,achievementsKnown:true,achievements:[],private:'secret'}]});
  });
  assert.equal(result.items.find(row=>row.id===a).achievementsKnown,true);
  assert.deepEqual(result.items.find(row=>row.id===a).achievements,[]);
  assert.notEqual(result.items.find(row=>row.id===b).achievementsKnown,true);
  assert.equal(JSON.stringify(result).includes('secret'),false);
});
test('real boards join by UUID and convert active minutes to hours without exporting private fields',async()=>{
  const env={PLAYTIME_LEADERBOARDS:bucket({generatedAt:at,unit:'minutes',players:[{uuid:a,username:'Player',value:90,stats:{activeMinutes:90},lastSeenAt:'private',ip:'private'}]}),BALANCE_LEADERBOARDS:bucket({generatedAt:at,players:[{uuid:a,username:'Player',value:42},{uuid:b,username:'Other',value:7}]})};
  const result=await readPublicPlayerDirectory(env,now);assert.equal(result.items.length,2);
  const player=result.items.find(row=>row.id===a);assert.equal(player.playtime,1.5);assert.equal(player.balance,42);
  assert.equal(result.items.find(row=>row.id===b).playtime,null);
  assert.equal(result.limited,true);assert.equal(result.stale,false);assert.equal(JSON.stringify(result).includes('private'),false);
});
test('one failed board preserves the other with partial source freshness',async()=>{
  const result=await readPublicPlayerDirectory({PLAYTIME_LEADERBOARDS:{get:async()=>{throw new Error('missing')}},BALANCE_LEADERBOARDS:bucket({generatedAt:new Date(now-3600000).toISOString(),players:[{uuid:a,username:'Player',value:0}]})},now);
  assert.equal(result.items[0].balance,0);assert.equal(result.items[0].playtime,null);assert.equal(result.stale,true);
});
test('unavailable boards and hostile identities never produce fictitious profiles',async()=>{
  assert.equal(await readPublicPlayerDirectory({},now),null);
  const env={BALANCE_LEADERBOARDS:bucket({generatedAt:at,players:[{uuid:'bad',username:'Player',value:1},{uuid:a,username:'<script>',value:2}]})};
  assert.equal(await readPublicPlayerDirectory(env,now),null);
});
test('unsupported units, duplicate UUIDs and invalid values remain unavailable',async()=>{
  const result=await readPublicPlayerDirectory({PLAYTIME_LEADERBOARDS:bucket({generatedAt:at,unit:'ticks',players:[{uuid:a,username:'Player',value:99},{uuid:a,username:'Duplicate',value:100}]}),BALANCE_LEADERBOARDS:bucket({generatedAt:at,players:[{uuid:a,username:'Player',value:-1}]})},now);
  assert.equal(result.items.length,1);assert.equal(result.items[0].playtime,null);assert.equal(result.items[0].balance,null);
});

test('full guild directory supplies player guilds and leaves incomplete rosters unknown',async()=>{
  const guild='20000000-0000-4000-8000-000000000002';
  const base={BALANCE_LEADERBOARDS:bucket({generatedAt:at,players:[{uuid:a,username:'Player',value:5},{uuid:b,username:'Other',value:3}]}),GUILDS_DIRECTORY_API_URL:'https://guilds.example/directory',GUILDS_API_BEARER:'secret'};
  const payload={generatedAt:at,directoryRevision:'a'.repeat(64),total:1,offset:0,nextOffset:null,entries:[{id:guild,name:'Guild',memberCount:1,memberUuids:[a],level:10,banner:{baseColor:'RED',patterns:[]}}]};
  const result=await readPublicPlayerDirectory(base,now,async()=>Response.json(payload));
  assert.equal(result.items.find(row=>row.id===a).guildMemberships[0].name,'Guild');
  assert.equal(result.items.find(row=>row.id===a).guildMemberships[0].banner.baseColor,'RED');
  assert.deepEqual(result.items.find(row=>row.id===b).guildMemberships,[]);
  const partial=await readPublicPlayerDirectory(base,now,async()=>Response.json({...payload,entries:[{...payload.entries[0],memberUuids:null}]}));
  assert.equal(partial.items[0].guildsKnown,undefined);
});

test('fresh authoritative guild capture updates stored profiles without refreshing old player stats',async()=>{
  const {enrichStoredPlayerGuilds}=await import('../functions/lib/player-directory-source.js');
  const guild='20000000-0000-4000-8000-000000000002',old=new Date(now-3600000).toISOString();
  const snapshot={generatedAt:old,items:[{id:a,name:'Player',guildsKnown:true,guildMemberships:[{id:guild,name:'Old'}]}]};
  const payload={generatedAt:at,directoryRevision:'a'.repeat(64),total:1,offset:0,nextOffset:null,entries:[{id:guild,name:'Current',memberCount:1,memberUuids:[a]}]};
  const result=await enrichStoredPlayerGuilds(snapshot,{GUILDS_DIRECTORY_API_URL:'https://guilds.example/directory',GUILDS_API_BEARER:'secret'},now,async()=>Response.json(payload));
  assert.equal(result.items[0].guildMemberships[0].name,'Current');assert.equal(result.sourceUpdatedAt,old);assert.equal(result.generatedAt,at);
});

test('achievement enrichment joins known results to full profiles without replacing existing progress or refreshing old stats',async()=>{
  const {enrichPlayerAchievements}=await import('../functions/lib/player-directory-source.js');
  const old=new Date(now-3600000).toISOString();
  const snapshot={generatedAt:old,items:[{id:a,name:'Player',balance:5},{id:b,name:'Other',achievementsKnown:true,achievements:['Existing']}]};
  const env={COMMUNITY_PLAYER_ACHIEVEMENTS_API_URL:'https://api.example/players',COMMUNITY_PLAYER_ACHIEVEMENTS_API_TOKEN:'t'.repeat(32)};
  const result=await enrichPlayerAchievements(snapshot,env,now,async url=>{
    assert.equal(url.searchParams.get('players'),a);
    return Response.json({generatedAt:at,items:[{id:a,achievementsKnown:true,achievements:['New']}]});
  });
  assert.deepEqual(result.items[0].achievements,['New']);
  assert.deepEqual(result.items[1].achievements,['Existing']);
  assert.equal(result.generatedAt,old);
  assert.equal(snapshot.items[0].achievementsKnown,undefined);
  const unavailable=await enrichPlayerAchievements(snapshot,env,now,async()=>{throw new Error('offline')});
  assert.equal(unavailable,snapshot);
});
