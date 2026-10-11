import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleCommunity } from '../functions/lib/community/service.js';
import { dispatchAlerts } from '../cloudflare/market-alerts/worker.js';

function database(){
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/community/0001_community.sql',import.meta.url),'utf8'));
  const db={prepare(query){let values=[];return {bind(...v){values=v;return this;},async first(){return sql.prepare(query).get(...values)??null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){const r=sql.prepare(query).run(...values);return {meta:{changes:Number(r.changes)}};}};},async batch(statements){sql.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  return {db,sql};
}
const dependencies={editor:async()=>({id:'editor'}),identity:async()=>({id:'discord-user'})};
function request(db,path,method='GET',payload,extra={}){
  return handleCommunity({request:new Request('https://site.example/api/community/'+path,{method,headers:{origin:'https://site.example',...extra.headers},...(payload===undefined?{}:{body:JSON.stringify(payload)})}),params:{path},env:{COMMUNITY_DB:db,...extra.env}},extra.dependencies??dependencies);
}
const news={kind:'news',slug:'hello',title:'Hello',body:'**Hi**',status:'draft'};
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
