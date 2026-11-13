import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleCommunity } from '../functions/lib/community/service.js';
import { dispatchAlerts } from '../cloudflare/market-alerts/worker.js';
import { guildQuestPreview } from '../scripts/guild-quests-preview-data.mjs';

function database(){
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/community/0001_community.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../migrations/community/0002_market_generation_fence.sql',import.meta.url),'utf8'));
  const db={prepare(query){let values=[];return {bind(...v){values=v;return this;},async first(){return sql.prepare(query).get(...values)??null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){const r=sql.prepare(query).run(...values);return {meta:{changes:Number(r.changes)}};}};},async batch(statements){sql.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  return {db,sql};
}
const dependencies={editor:async()=>({id:'editor'}),identity:async()=>({id:'discord-user'})};
function request(db,path,method='GET',payload,extra={}){
  return handleCommunity({request:new Request('https://site.example/api/community/'+path,{method,headers:{origin:'https://site.example',...extra.headers},...(payload===undefined?{}:{body:JSON.stringify(payload)})}),params:{path},env:{COMMUNITY_DB:db,...extra.env}},extra.dependencies??dependencies);
}
const news={kind:'news',slug:'hello',title:'Hello',body:'**Hi**',status:'draft'};
test('fresh guild association does not conceal stale balance and playtime in a stored profile',async()=>{
  const {db}=database();const sourceUpdatedAt=new Date(Date.now()-3600000).toISOString();
  await signed(db,{kind:'players',generatedAt:new Date().toISOString(),sourceUpdatedAt,items:[{id:'player',name:'Player',balance:42,guildsKnown:true,guildMemberships:[{id:'guild',name:'Guild'}]}]},'profile-fresh-guild-12345');
  const profile=await(await request(db,'players')).json();assert.equal(profile.stale,true);assert.equal(profile.sourceUpdatedAt,sourceUpdatedAt);
  assert.equal(profile.items[0].guildMemberships[0].name,'Guild');
});

test('dated public snapshots cannot be replaced by an older or undated signed export',async()=>{
  const {db}=database();const generatedAt=new Date(Date.now()-60000).toISOString();
  const payload={kind:'bounties',generatedAt,items:[{id:'player',name:'Player',gold:12}]};
  assert.equal((await signed(db,payload,'fresh-bounty-12345')).status,200);
  assert.equal((await signed(db,{...payload,generatedAt:new Date(Date.now()-120000).toISOString()},'older-bounty-12345')).status,409);
  const undated={...payload};delete undated.generatedAt;
  assert.equal((await signed(db,{...undated,items:[{id:'player',name:'Player',gold:99}]},'undated-bounty-12345')).status,409);
  const result=await (await request(db,'bounties')).json();
  assert.equal(result.generatedAt,generatedAt);assert.equal(result.items[0].gold,12);
});

test('unattributed ledger sales contribute to prices without creating stall or guild leaders',async()=>{
  const {db}=database();const sale={id:'ledger-8',item:'diamond',quantity:3,gold:42,occurredAt:new Date().toISOString()};
  assert.equal((await signed(db,{kind:'sales',items:[sale]},'ledger-sale-12345')).status,200);
  for(const mode of ['stall','guild']){
    const response=await handleCommunity({request:new Request('https://site.example/api/community/insights?mode='+mode+'&item=diamond'),params:{path:'insights'},env:{COMMUNITY_DB:db}},dependencies);
    const data=await response.json();assert.equal(data.prices[0].price,14);assert.equal(data.history[0].quantity,3);assert.deepEqual(data.leaders,[]);
  }
});
test('guild route uses a configured authenticated full directory without exposing credentials',async()=>{
  const {db,sql}=database();const savedFetch=globalThis.fetch;
  const guildId='87654321-4321-4321-4321-cba987654321';
  try {
    globalThis.fetch=async(url,options)=>{
      if(String(url).includes('market-api')) {assert.equal(options.headers.Authorization,undefined);return Response.json({stalls:[{owner:{type:'GUILD',id:guildId,avatar:{kind:'GUILD_BANNER',banner:{baseColor:'BLACK',patterns:[]}}}}]});}
      if(String(url).includes('playtime-active-all')) {assert.equal(options.headers.Authorization,undefined);return Response.json({generatedAt:new Date().toISOString(),players:[]});}
      assert.equal(options.headers.Authorization,'Bearer test-secret');
      return Response.json({generatedAt:new Date().toISOString(),directoryRevision:'a'.repeat(64),total:1,offset:0,nextOffset:null,
        entries:[{id:guildId,name:'Live guild',level:80,prestige:2,seasonalElo:1100,privateField:'never-publish'}]});
    };
    const response=await request(db,'guilds','GET',undefined,{env:{GUILDS_DIRECTORY_API_URL:'https://guilds.example/api/community/guild-directory',GUILDS_API_BEARER:'test-secret'}});
    const data=await response.json();assert.equal(response.status,200);assert.equal(data.limited,false);
    assert.equal(data.items[0].prestige,2);assert.equal(data.items[0].elo,1100);
    assert.equal(data.items[0].banner.baseColor,'BLACK');
    assert.equal(JSON.stringify(data).includes('secret'),false);assert.equal(JSON.stringify(data).includes('never-publish'),false);
  } finally {globalThis.fetch=savedFetch;sql.close();}
});
test('guild route publishes complete roster names from fresh public players and never leaks member UUIDs',async()=>{
  const {db,sql}=database();const savedFetch=globalThis.fetch;
  const id='12345678-1234-1234-1234-123456789abc';
  const fresh=new Date().toISOString();
  try {
    sql.prepare('INSERT INTO community_snapshots (kind,payload,updated_at) VALUES (?,?,?)').run('players',JSON.stringify({items:[{id,name:'Player'}]}),fresh);
    globalThis.fetch=async url=>String(url).includes('market-api') ? Response.json({stalls:[]}) : Response.json({generatedAt:fresh,directoryRevision:'a'.repeat(64),total:1,offset:0,nextOffset:null,
      entries:[{id:'guild-1',name:'Guild',memberCount:1,memberUuids:[id]}]});
    const extra={env:{GUILDS_DIRECTORY_API_URL:'https://guilds.example/api/community/guild-directory',GUILDS_API_BEARER:'test-secret'}};
    let data=await (await request(db,'guilds','GET',undefined,extra)).json();
    assert.deepEqual(data.items[0].membersList,['Player']);assert.equal(JSON.stringify(data).includes(id),false);
    sql.prepare('UPDATE community_snapshots SET updated_at=? WHERE kind=?').run(new Date(Date.now()-3600000).toISOString(),'players');
    data=await (await request(db,'guilds','GET',undefined,extra)).json();assert.deepEqual(data.items[0].membersList,[]);
  } finally {globalThis.fetch=savedFetch;sql.close();}
});
test('guild route can resolve a complete roster from the public leaderboard when player snapshots are absent',async()=>{
  const {db,sql}=database();const savedFetch=globalThis.fetch;
  const id='12345678-1234-1234-1234-123456789abc', now=new Date().toISOString();
  try {
    globalThis.fetch=async(url,options)=>{
      if(String(url).includes('market-api'))return Response.json({stalls:[]});
      if(String(url).includes('playtime-active-all')) {
        assert.equal(options.headers.Authorization,undefined);
        return Response.json({generatedAt:now,players:[{uuid:id,username:'RealPlayer'}]});
      }
      return Response.json({generatedAt:now,directoryRevision:'a'.repeat(64),total:1,offset:0,nextOffset:null,
        entries:[{id:'guild-1',name:'Guild',memberCount:1,memberUuids:[id]}]});
    };
    const extra={env:{GUILDS_DIRECTORY_API_URL:'https://guilds.example/api/community/guild-directory',GUILDS_API_BEARER:'test-secret'}};
    const data=await (await request(db,'guilds','GET',undefined,extra)).json();
    assert.deepEqual(data.items[0].membersList,['RealPlayer']);assert.equal(JSON.stringify(data).includes(id),false);
  } finally {globalThis.fetch=savedFetch;sql.close();}
});
test('guild route supplements incomplete fresh player snapshots without publishing partial rosters',async()=>{
  const {db,sql}=database();const savedFetch=globalThis.fetch;
  const first='12345678-1234-1234-1234-123456789abc',second='87654321-4321-4321-4321-cba987654321',now=new Date().toISOString();
  try {
    sql.prepare('INSERT INTO community_snapshots (kind,payload,updated_at) VALUES (?,?,?)').run('players',JSON.stringify({items:[{id:first,name:'First'}]}),now);
    globalThis.fetch=async(url,options)=>{
      if(String(url).includes('market-api'))return Response.json({stalls:[]});
      if(String(url).includes('playtime-active-all')) {assert.equal(options.headers.Authorization,undefined);return Response.json({generatedAt:now,players:[{uuid:second,username:'Second'}]});}
      return Response.json({generatedAt:now,directoryRevision:'a'.repeat(64),total:1,offset:0,nextOffset:null,
        entries:[{id:'guild-1',name:'Guild',memberCount:2,memberUuids:[first,second]}]});
    };
    const extra={env:{GUILDS_DIRECTORY_API_URL:'https://guilds.example/api/community/guild-directory',GUILDS_API_BEARER:'test-secret'}};
    const data=await (await request(db,'guilds','GET',undefined,extra)).json();
    assert.deepEqual(data.items[0].membersList,['First','Second']);
  } finally {globalThis.fetch=savedFetch;sql.close();}
});
test('malformed optional directory falls back to the limited leaderboard',async()=>{
  const {db,sql}=database();const savedFetch=globalThis.fetch;
  try {
    globalThis.fetch=async url=>{
      if(String(url).includes('market-api'))return Response.json({stalls:[]});
      if(String(url).includes('guilds.example'))return Response.json({generatedAt:new Date().toISOString(),directoryRevision:'a'.repeat(64),total:1,offset:0,nextOffset:null,entries:[{id:'bad id',name:'Invalid'}]});
      return Response.json({generatedAt:new Date().toISOString(),entries:[{id:'valid',name:'Fallback'}]});
    };
    const response=await request(db,'guilds','GET',undefined,{env:{GUILDS_DIRECTORY_API_URL:'https://guilds.example/api/community/guild-directory',GUILDS_API_BEARER:'test-secret'}});
    const data=await response.json();assert.equal(response.status,200);assert.equal(data.limited,true);assert.equal(data.items[0].name,'Fallback');
  } finally {globalThis.fetch=savedFetch;sql.close();}
});
test('stale guild snapshots yield only to a newer live leaderboard and survive upstream failures',async()=>{
  const {db,sql}=database();
  const snapshot={items:[{id:'guild-1',name:'Old guild',level:1}]};
  const old=new Date(Date.now()-3600000).toISOString();
  const recent=new Date(Date.now()-1000).toISOString();
  sql.prepare('INSERT INTO community_snapshots (kind,payload,updated_at) VALUES (?,?,?)').run('guilds',JSON.stringify(snapshot),old);
  const savedFetch=globalThis.fetch;
  try {
    let calls=0;
    globalThis.fetch=async url=>{
      calls++;
      if(String(url).includes('market-api')) return Response.json({stalls:[]});
      return Response.json({generatedAt:recent,entries:[{id:'guild-1',name:'Live guild',level:2}]});
    };
    let data=await (await request(db,'guilds')).json();
    assert.equal(data.items[0].name,'Live guild');assert.equal(data.limited,true);assert.equal(data.stale,false);
    globalThis.fetch=async()=>{throw new Error('unavailable');};
    data=await (await request(db,'guilds')).json();
    assert.equal(data.items[0].name,'Old guild');assert.equal(data.stale,true);
    globalThis.fetch=async()=>Response.json({generatedAt:old,entries:[{id:'guild-1',name:'Not newer'}]});
    data=await (await request(db,'guilds')).json();assert.equal(data.items[0].name,'Old guild');
    sql.prepare('UPDATE community_snapshots SET updated_at=? WHERE kind=?').run(recent,'guilds');
    globalThis.fetch=async()=>{throw new Error('fresh snapshots should not fetch');};
    data=await (await request(db,'guilds')).json();assert.equal(data.items[0].name,'Old guild');assert.equal(data.stale,false);
    const future=new Date(Date.now()+86400000).toISOString();
    sql.prepare('UPDATE community_snapshots SET updated_at=? WHERE kind=?').run(future,'guilds');
    globalThis.fetch=async url=>String(url).includes('market-api')?Response.json({stalls:[]}):Response.json({generatedAt:recent,entries:[{id:'guild-1',name:'Live guild'}]});
    data=await (await request(db,'guilds')).json();assert.equal(data.items[0].name,'Live guild');
    globalThis.fetch=async()=>{throw new Error('unavailable');};
    data=await (await request(db,'guilds')).json();assert.equal(data.stale,true);
    assert.ok(calls>0);
  } finally {globalThis.fetch=savedFetch;sql.close();}
});
test('quest feed fails closed until signed data exists, projects privacy, and uses source freshness',async()=>{
  const {db}=database();assert.equal((await request(db,'guildquests')).status,503);
  const input=guildQuestPreview();input.generatedAt=new Date(Date.now()-3600000).toISOString();input.items[0].quests[0].standings[0].claimActorId='private';
  assert.equal((await request(db,'ingest','POST',input)).status,401);
  assert.equal((await signed(db,input)).status,200);
  const response=await request(db,'guildquests');assert.equal(response.status,200);const data=await response.json();assert.equal(data.stale,true);assert.equal(JSON.stringify(data).includes('private'),false);
  assert.equal((await signed(db,input)).status,409);assert.equal((await request(db,'guildquests','POST',{})).status,404);
  const newer={...input,generatedAt:new Date().toISOString()};assert.equal((await signed(db,newer,'quest-newer-12345')).status,200);
  assert.equal((await signed(db,input,'quest-older-12345')).status,409);
  assert.equal((await (await request(db,'guildquests')).json()).generatedAt,newer.generatedAt);
});
test('draft isolation, publishing, revision conflict and audit are persisted',async()=>{
  const {db,sql}=database();
  assert.equal((await request(db,'admin/news','POST',news)).status,200);
  assert.deepEqual((await (await request(db,'news')).json()).items,[]);
  assert.equal((await request(db,'admin/news','POST',{...news,status:'published',revision:1})).status,200);
  assert.equal((await (await request(db,'news')).json()).items.length,1);
  assert.equal((await request(db,'admin/news','POST',{...news,revision:1})).status,409);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM community_audit').get().n,2);
});
test('unauthorized/cross-origin writes fail before persistence',async()=>{
  const {db}=database();
  assert.equal((await request(db,'admin/news','POST',news,{headers:{origin:'https://evil.example'}})).status,403);
  assert.equal((await request(db,'admin/news','POST',news,{dependencies:{...dependencies,editor:async()=>null}})).status,403);
  assert.equal((await request(db,'admin/timeline','POST',news)).status,400);
});
test('polls enforce one ballot, hidden results, closed writes and stable options',async()=>{
  const {db,sql}=database();const poll={kind:'polls',slug:'p1',title:'Choose',options:['One','Two'],closesAt:new Date(Date.now()+60000).toISOString(),status:'published'};
  await request(db,'admin/polls','POST',poll);
  assert.equal((await request(db,'polls/p1','POST',{choice:0})).status,200);
  assert.equal((await request(db,'polls/p1','POST',{choice:1})).status,200);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM community_votes').get().n,1);
  assert.equal((await (await request(db,'polls/p1')).json()).totals,null);
  assert.equal((await request(db,'admin/polls','POST',{...poll,options:['Other','Two'],revision:1})).status,409);
  assert.equal((await request(db,'admin/polls','POST',{...poll,closesAt:new Date(Date.now()-1000).toISOString(),revision:1})).status,200);
  assert.equal((await request(db,'polls/p1','POST',{choice:0})).status,409);
  assert.deepEqual((await (await request(db,'polls/p1')).json()).totals,[{choice:1,votes:1}]);
});
async function signed(db,payload,nonce='0123456789abcdef'){
  const raw=JSON.stringify(payload),time=String(Date.now()),secret='k'.repeat(32),enc=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(`${time}\n${nonce}\n/api/community/ingest\n${raw}`)))].map(v=>v.toString(16).padStart(2,'0')).join('');
  return request(db,'ingest','POST',payload,{env:{COMMUNITY_INGEST_SECRET:secret},headers:{'x-enthusia-timestamp':time,'x-enthusia-nonce':nonce,'x-enthusia-signature':sig}});
}
test('market insights group sales at Eastern week boundaries across daylight saving changes',async()=>{
  const {db,sql}=database();
  const add=(id,when)=>sql.prepare('INSERT INTO market_sales VALUES (?,?,?,?,?,?,?)').run(id,'stall1','guild','stone',1,1,when);
  add('before-spring','2026-03-09T03:59:59.000Z');
  add('after-spring','2026-03-09T04:00:00.000Z');
  add('before-fall','2026-11-02T04:59:59.000Z');
  add('after-fall','2026-11-02T05:00:00.000Z');
  const read=week=>handleCommunity({request:new Request('https://site.example/api/community/insights?week='+week),params:{path:'insights'},env:{COMMUNITY_DB:db}},dependencies);
  const old=(await (await read('2026-10-26')).json());
  const next=(await (await read('2026-11-02')).json());
  assert.equal(old.week,'2026-10-26T04:00:00.000Z');
  assert.equal(old.leaders[0].gold,1);
  assert.equal(next.week,'2026-11-02T05:00:00.000Z');
  assert.equal(next.leaders[0].gold,1);
  assert.ok(old.weeks.includes('2026-03-02'));
  assert.ok(old.weeks.includes('2026-03-09'));
  assert.ok(old.weeks.includes('2026-10-26'));
  assert.ok(old.weeks.includes('2026-11-02'));
});
test('a fresh completeness flag alone cannot establish historical market coverage',async()=>{
  const {db,sql}=database();
  const read=()=>handleCommunity({request:new Request('https://site.example/api/community/insights'),params:{path:'insights'},env:{COMMUNITY_DB:db}},dependencies);
  assert.equal((await (await read()).json()).coverageComplete,false);
  sql.prepare('INSERT INTO community_snapshots(kind,payload,updated_at) VALUES (?,?,?)').run('sales_coverage',JSON.stringify({complete:true}),new Date().toISOString());
  assert.equal((await (await read()).json()).coverageComplete,false);
  sql.prepare('UPDATE community_snapshots SET updated_at=? WHERE kind=?').run(new Date(Date.now()-3600000).toISOString(),'sales_coverage');
  assert.equal((await (await read()).json()).coverageComplete,false);
});
test('signed sales ingest is replay resistant, idempotent and aggregates unit prices',async()=>{
  const {db,sql}=database();const payload={kind:'sales',items:[{id:'sale-1',stall:'stall-1',guild:'Guild',item:'stone',quantity:4,gold:2,occurredAt:new Date().toISOString()}]};
  assert.equal((await signed(db,payload)).status,200);
  assert.equal((await signed(db,payload)).status,409);
  assert.equal((await signed(db,payload,'fedcba9876543210')).status,200);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_sales').get().n,1);
  const insight=await (await request(db,'insights?item=stone')).json();
  // Route parameters exclude the URL query, as Cloudflare does.
  const response=await handleCommunity({request:new Request('https://site.example/api/community/insights?item=stone'),params:{path:'insights'},env:{COMMUNITY_DB:db}},dependencies);
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.prices[0].price,.5);assert.equal(data.leaders[0].gold,2);assert.equal(data.history[0].quantity,4);assert.equal(insight.error,'not_found');
});
test('snapshots expose no arbitrary source fields and fail closed without bindings',async()=>{
  const {db}=database();await signed(db,{kind:'players',items:[{id:'player',name:'Player',ip:'secret',email:'secret'}]});
  const data=await (await request(db,'players')).json();assert.equal(JSON.stringify(data).includes('secret'),false);
  assert.equal((await request(null,'players')).status,503);
});
test('alert subscriptions enforce a per-account limit, updates and opt-out',async()=>{
  const {db}=database();for(let i=0;i<20;i++)assert.equal((await request(db,'alerts','POST',{item:'item-'+i,threshold:1})).status,200);
  assert.equal((await request(db,'alerts','POST',{item:'overflow',threshold:1})).status,409);
  assert.equal((await request(db,'alerts','POST',{item:'item-0',threshold:.5})).status,200);
  assert.equal((await request(db,'alerts','POST',{item:'item-0',remove:true})).status,200);
  assert.equal((await (await request(db,'alerts')).json()).items.length,19);
});
test('alert worker is disabled by default and sends only opt-in threshold matches with cooldown',async()=>{
  const {db,sql}=database();let calls=0;const send=async (_url,options)=>{calls++;const data=JSON.parse(options.body);if(calls%2)assert.equal(data.recipient_id,'123456789012345678');else assert.deepEqual(data.allowed_mentions,{parse:[]});return Response.json({id:'234567890123456789'});};
  assert.deepEqual(await dispatchAlerts({COMMUNITY_DB:db},send),{sent:0,enabled:false});assert.equal(calls,0);
  sql.prepare('INSERT INTO market_alerts(subscriber,item,threshold,updated_at) VALUES (?,?,?,?)').run('123456789012345678','stone',1,new Date().toISOString());
  sql.prepare('INSERT INTO market_sales VALUES (?,?,?,?,?,?,?)').run('sale','stall','guild','stone',4,2,new Date().toISOString());
  const env={COMMUNITY_DB:db,MARKET_ALERTS_ENABLED:'true',DISCORD_BOT_TOKEN:'test-only'};
  assert.equal((await dispatchAlerts(env,send)).sent,1);assert.equal(calls,2);
  assert.equal((await dispatchAlerts(env,send)).sent,0);assert.equal(calls,2);
});

test('news pins order published records and author identity is set by the authenticated editor',async()=>{
 const {db}=database();const trusted={...dependencies,editor:async()=>({id:'editor',name:'RealEditor',rank:'Admin'})};
 await request(db,'admin/news','POST',{...news,slug:'pinned',status:'published',pinned:true,authorName:'Forged',authorRank:'Founder'},{dependencies:trusted});
 await request(db,'admin/news','POST',{...news,slug:'newer',status:'published'},{dependencies:trusted});
 const publicItems=(await (await request(db,'news')).json()).items;
 assert.equal(publicItems[0].slug,'pinned');assert.equal(publicItems[0].pinned,true);assert.equal(publicItems[0].authorName,'RealEditor');assert.equal(publicItems[0].authorRank,'Admin');
});

test('market alerts use the dedicated website notification token before legacy credentials',async()=>{
 const {db,sql}=database();
 sql.prepare('INSERT INTO market_alerts(subscriber,item,threshold,updated_at) VALUES (?,?,?,?)').run('123456789012345678','minecraft:stone',1,new Date().toISOString());
 sql.prepare('INSERT INTO market_sales VALUES (?,?,?,?,?,?,?)').run('token-sale','stall','guild','minecraft:stone',4,2,new Date().toISOString());
 let messages=0;
 const send=async(url,options)=>{
  assert.equal(options.headers.authorization,'Bot dedicated-test-token');
  if(url.endsWith('/channels'))return Response.json({id:'234567890123456789'});
  const payload=JSON.parse(options.body);assert.match(payload.content,/#item=minecraft%3Astone/);assert.deepEqual(payload.allowed_mentions,{parse:[]});messages++;return Response.json({id:'345678901234567890'});
 };
 assert.equal((await dispatchAlerts({COMMUNITY_DB:db,MARKET_ALERTS_ENABLED:'true',ENTHUSIA_SITE_DISCORD_BOT_TOKEN:'dedicated-test-token',DISCORD_BOT_TOKEN:'legacy-test-token'},send)).sent,1);
 assert.equal(messages,1);
});
test('public player boards remain available without the optional community database',async()=>{
  const id='10000000-0000-4000-8000-000000000001';
  const data={generatedAt:new Date().toISOString(),players:[{uuid:id,username:'Player',value:9}]};
  const env={BALANCE_LEADERBOARDS:{get:async()=>({json:async()=>data})}};
  const response=await request(null,'players','GET',undefined,{env});
  assert.equal(response.status,200);const result=await response.json();assert.equal(result.items[0].name,'Player');assert.equal(result.limited,true);
  assert.equal((await request(null,'news')).status,503);
});
