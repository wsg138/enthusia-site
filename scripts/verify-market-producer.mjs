// Local-only contract proof: a native test fixture, never real server data.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {runCommunitySync} from '../cloudflare/community-sync/index.js';
import {handleCommunity} from '../functions/lib/community/service.js';
const fixture=JSON.parse(await readFile(process.argv[2],'utf8'));
const sql=new DatabaseSync(':memory:');
sql.exec(await readFile(new URL('../migrations/community/0001_community.sql',import.meta.url),'utf8'));
const db={prepare(query){let args=[];return {
  bind(...values){args=values;return this;},
  async first(){return sql.prepare(query).get(...args)??null;},
  async all(){return {results:sql.prepare(query).all(...args)};},
  async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}
};},async batch(statements){
  sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results;}
  catch(error){sql.exec('ROLLBACK');throw error;}
}};
const env={COMMUNITY_DB:db,COMMUNITY_SYNC_ENABLED:'true',COMMUNITY_SALES_API_URL:'https://source.example/sales'};
const seen=[];
const fetchImpl=async url=>{
  seen.push(url.searchParams.get('after'));
  return Response.json(seen.length===1?fixture:{items:[],nextCursor:null,checkpointCursor:fixture.checkpointCursor});
};
await runCommunitySync(env,fetchImpl);await runCommunitySync(env,fetchImpl);
assert.deepEqual(seen,[null,'9']);
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_sales').get().n,1);
const response=await handleCommunity({request:new Request('https://site.example/api/community/insights?item=diamond'),params:{path:'insights'},env});
assert.equal(response.status,200);
const data=await response.json();
assert.equal(data.prices[0].price,14);assert.equal(data.prices[0].quantity,3);
assert.equal(data.history[0].price,14);assert.deepEqual(data.leaders,[]);
assert.equal(JSON.stringify(data).includes('999'),false);
sql.close();
console.log('Native SQLite -> authenticated HTTP -> sync -> SQLite -> public price/history contract passed. Synthetic local fixture only.');
