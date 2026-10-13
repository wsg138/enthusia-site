// Native companion test fixture -> real signed ingest -> SQLite -> public feed.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {handleCommunity} from '../functions/lib/community/service.js';
const fixture=JSON.parse(await readFile(process.argv[2],'utf8')),sql=new DatabaseSync(':memory:');
sql.exec(await readFile(new URL('../migrations/community/0001_community.sql',import.meta.url),'utf8'));
const db={prepare(query){let args=[];return {bind(...values){args=values;return this;},
  async first(){return sql.prepare(query).get(...args)??null;},async all(){return {results:sql.prepare(query).all(...args)};},
  async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};},
  async batch(statements){sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
const env={COMMUNITY_DB:db,COMMUNITY_INGEST_SECRET:'k'.repeat(32)};
const headers=Object.fromEntries(Object.entries(fixture.headers).map(([name,values])=>[name,values[0]]));
const ingest=()=>handleCommunity({request:new Request('https://enthusia.info/api/community/ingest',{method:'POST',headers,body:fixture.body}),params:{path:'ingest'},env});
assert.equal((await ingest()).status,200);assert.equal((await ingest()).status,409);
const feed=await handleCommunity({request:new Request('https://enthusia.info/api/community/warzone'),params:{path:'warzone'},env});
assert.equal(feed.status,200);const data=await feed.json();
assert.equal(data.duelResultsComplete,true);assert.equal(data.stale,false);
assert.deepEqual(data.items.filter(row=>row.type==='leader').map(row=>row.wins),[1,1]);
assert.equal(JSON.stringify(data).includes('PrivateOpponent'),false);
assert.equal(data.items.find(row=>row.type==='kit').manualOverride,true);
assert.ok(data.weekStartsAt);assert.ok(data.duelUpdatedAt);
if(process.argv[3])await writeFile(process.argv[3],JSON.stringify(data,null,2)+'\n');
sql.close();console.log('Native H2 team winners -> MaceGuard HMAC -> SQLite ingest -> public Warzone feed passed. Synthetic fixture only.');
