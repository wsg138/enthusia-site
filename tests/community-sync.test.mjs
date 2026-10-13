import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { runCommunitySync } from '../cloudflare/community-sync/index.js';
import { readCommunitySales } from '../functions/lib/community/upstream.js';
function database() {
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/community/0001_community.sql',import.meta.url),'utf8'));
  const db={prepare(query){let values=[];return {bind(...args){values=args;return this;},async first(){return sql.prepare(query).get(...values)??null;},async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};}};},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
  return {sql,db};
}
const sale=(id='sale-1')=>({id,stall:'stall12',guild:'Public Guild',item:'diamond',quantity:2,gold:20,occurredAt:new Date(Date.now()-60000).toISOString(),direction:'SELL',currency:'RAW_GOLD',buyer:'private'});
test('scheduled sync is disabled by default and performs no requests or writes',async()=>{
  let calls=0;const result=await runCommunitySync({COMMUNITY_DB:{prepare(){calls++;}}},async()=>{calls++;});
  assert.equal(result.enabled,false);assert.equal(calls,0);
});
test('snapshots preserve source freshness, privacy and newer records when an older export arrives',async()=>{
  const {db,sql}=database(),env={COMMUNITY_DB:db,COMMUNITY_SYNC_ENABLED:'true',COMMUNITY_BOUNTIES_API_URL:'https://source.example/bounties'};
  let generatedAt=new Date(Date.now()-60000).toISOString();
  const fetchImpl=async()=>Response.json({generatedAt,items:[{id:'target',name:'Player',gold:4,secret:'private'}]});
  const first=await runCommunitySync(env,fetchImpl);assert.equal(first.results.find(row=>row.kind==='bounties').status,'updated');
  const initial=sql.prepare("SELECT payload,updated_at FROM community_snapshots WHERE kind='bounties'").get();
  assert.equal(initial.updated_at,generatedAt);assert.equal(initial.payload.includes('private'),false);
  generatedAt=new Date(Date.now()-3600000).toISOString();
  const second=await runCommunitySync(env,fetchImpl);assert.equal(second.results.find(row=>row.kind==='bounties').status,'unchanged');
  assert.deepEqual(sql.prepare("SELECT payload,updated_at FROM community_snapshots WHERE kind='bounties'").get(),initial);
});
test('sales pages advance checkpoints atomically and replays do not duplicate history',async()=>{
  const {db,sql}=database(),env={COMMUNITY_DB:db,COMMUNITY_SYNC_ENABLED:'true',COMMUNITY_SALES_API_URL:'https://source.example/sales'};
  const row=sale(),seen=[];
  const fetchImpl=async url=>{const after=url.searchParams.get('after');seen.push(after);return Response.json(after?{items:[],nextCursor:null}:{items:[row,{...row,id:'buy-1',direction:'BUY'}],nextCursor:'2'});};
  const first=await runCommunitySync(env,fetchImpl);assert.equal(first.results.at(-1).records,1);assert.deepEqual(seen,[null,'2']);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_sales').get().n,1);
  assert.equal(JSON.parse(sql.prepare("SELECT payload FROM community_snapshots WHERE kind='sales_cursor'").get().payload).cursor,'2');
  const second=await runCommunitySync(env,fetchImpl);assert.equal(second.results.at(-1).records,0);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_sales').get().n,1);
});
test('conflicting transaction IDs do not partially insert a page or advance its cursor',async()=>{
  const {db,sql}=database(),env={COMMUNITY_DB:db,COMMUNITY_SYNC_ENABLED:'true',COMMUNITY_SALES_API_URL:'https://source.example/sales'};
  const row=sale();const result=await runCommunitySync(env,async()=>Response.json({items:[row,{...row,gold:99}],nextCursor:'2'}));
  assert.equal(result.results.at(-1).status,'failed');assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_sales').get().n,0);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM community_snapshots WHERE kind='sales_cursor'").get().n,0);
});
test('sales reject ambiguous currencies, missing cursors and stalled pagination',async()=>{
  const env={COMMUNITY_SALES_API_URL:'https://source.example/sales'};
  for(const input of [{items:[{...sale(),currency:'OTHER'}],nextCursor:null},{items:[sale()]},{items:[sale()],nextCursor:'2'}]){
    assert.equal(await readCommunitySales(env,async()=>Response.json(input),Date.now(),'2'),null);
  }
});

test('final producer checkpoint survives restarts and BUY-only pages',async()=>{
  const {db,sql}=database(),env={COMMUNITY_DB:db,COMMUNITY_SYNC_ENABLED:'true',COMMUNITY_SALES_API_URL:'https://source.example/sales'};
  const seen=[];
  const fetchImpl=async url=>{
    const after=url.searchParams.get('after');seen.push(after);
    if(after===null)return Response.json({items:[sale()],nextCursor:null,checkpointCursor:'8'});
    if(after==='8')return Response.json({items:[],nextCursor:null,checkpointCursor:'12'});
    return Response.json({items:[],nextCursor:null,checkpointCursor:'12'});
  };
  await runCommunitySync(env,fetchImpl);await runCommunitySync(env,fetchImpl);await runCommunitySync(env,fetchImpl);
  assert.deepEqual(seen,[null,'8','12']);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_sales').get().n,1);
});

test('explicit sales checkpoint rejects malformed and backwards ledger positions',async()=>{
  const env={COMMUNITY_SALES_API_URL:'https://source.example/sales'};
  for(const checkpointCursor of ['1','invalid marker',null,42,'9999999999999999999']) {
    assert.equal(await readCommunitySales(env,async()=>Response.json({items:[],nextCursor:null,checkpointCursor}),Date.now(),'8'),null);
  }
});

test('overlapping sync cannot move a numeric checkpoint backwards',async()=>{
  const {db,sql}=database(),env={COMMUNITY_DB:db,COMMUNITY_SYNC_ENABLED:'true',COMMUNITY_SALES_API_URL:'https://source.example/sales'};
  const original=db.batch;let injected=false;
  db.batch=async statements=>{
    if(!injected){injected=true;sql.prepare("INSERT INTO community_snapshots VALUES('sales_cursor',?,?)")
      .run(JSON.stringify({source:env.COMMUNITY_SALES_API_URL,cursor:'12'}),new Date().toISOString());}
    return original(statements);
  };
  await runCommunitySync(env,async()=>Response.json({items:[sale()],nextCursor:null,checkpointCursor:'8'}));
  assert.equal(JSON.parse(sql.prepare("SELECT payload FROM community_snapshots WHERE kind='sales_cursor'").get().payload).cursor,'12');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_sales').get().n,1);
});

test('failed sales batch does not persist its terminal checkpoint',async()=>{
  const {db,sql}=database(),env={COMMUNITY_DB:db,COMMUNITY_SYNC_ENABLED:'true',COMMUNITY_SALES_API_URL:'https://source.example/sales'};
  db.batch=async()=>{throw new Error('simulated database failure');};
  const result=await runCommunitySync(env,async()=>Response.json({items:[sale()],nextCursor:null,checkpointCursor:'8'}));
  assert.equal(result.results.at(-1).status,'failed');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM community_snapshots').get().n,0);
});
