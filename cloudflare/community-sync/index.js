import { projectSnapshot } from '../../functions/lib/community/contracts.js';
import { readCommunityUpstream,readCommunitySales } from '../../functions/lib/community/upstream.js';
import { readPublicPlayerDirectory } from '../../functions/lib/player-directory-source.js';
import { salesStatements,snapshotStatement } from '../../functions/lib/community/persistence.js';

const kinds=['guilds','guildquests','players','bounties','achievements','warzone'];
async function synchronizeSnapshot(kind,env,fetchImpl) {
  let data=await readCommunityUpstream(kind,env,fetchImpl);
  if(!data&&kind==='players')data=await readPublicPlayerDirectory(env,Date.now(),fetchImpl);
  if(!data)return {kind,status:'unavailable'};
  // Use source time and public fields only. Partial board profiles retain their
  // coverage label rather than becoming a complete signed snapshot.
  const snapshot={...projectSnapshot(kind,data),generatedAt:data.generatedAt??data.updatedAt,
    ...(data.limited?{limited:true}:{}),...(data.source?{source:data.source}:{})};
  const result=await env.COMMUNITY_DB.batch([snapshotStatement(env.COMMUNITY_DB,kind,snapshot)]);
  return {kind,status:result[0].meta.changes?'updated':'unchanged',records:snapshot.items.length};
}
async function synchronizeSales(env,fetchImpl) {
  const db=env.COMMUNITY_DB;
  const saved=await db.prepare("SELECT payload FROM community_snapshots WHERE kind='sales_cursor'").first();
  const checkpoint=saved?JSON.parse(saved.payload):null;
  let cursor=checkpoint?.source===env.COMMUNITY_SALES_API_URL?checkpoint.cursor:null,records=0;
  for(let page=0;page<4;page++) {
    const data=await readCommunitySales(env,fetchImpl,Date.now(),cursor);
    if(!data)return {kind:'sales',status:'unavailable',records};
    const statements=await salesStatements(db,data);
    if(data.checkpointCursor!==null)statements.push(db.prepare(`INSERT INTO community_snapshots(kind,payload,updated_at)
      VALUES ('sales_cursor',?,?) ON CONFLICT(kind) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at
      WHERE json_extract(community_snapshots.payload,'$.source')<>?
        OR ?=0 OR CAST(json_extract(community_snapshots.payload,'$.cursor') AS INTEGER)<=CAST(? AS INTEGER)`)
      .bind(JSON.stringify({source:env.COMMUNITY_SALES_API_URL,cursor:data.checkpointCursor}),new Date().toISOString(),
        env.COMMUNITY_SALES_API_URL,/^\d{1,19}$/.test(data.checkpointCursor)?1:0,data.checkpointCursor));
    if(statements.length) {
      const results=await db.batch(statements);
      records+=results.slice(0,data.items.length).reduce((total,row)=>total+(row.meta.changes??0),0);
    }
    if(data.nextCursor===null)return {kind:'sales',status:records?'updated':'empty',records};
    cursor=data.nextCursor;
  }
  return {kind:'sales',status:'backlog',records};
}
export async function runCommunitySync(env,fetchImpl=fetch) {
  if(env.COMMUNITY_SYNC_ENABLED!=='true')return {enabled:false,results:[]};
  if(!env.COMMUNITY_DB)return {enabled:true,error:'database_unavailable',results:[]};
  const results=[];
  for(const kind of kinds) {
    try { results.push(await synchronizeSnapshot(kind,env,fetchImpl)); }
    catch { results.push({kind,status:'failed'}); }
  }
  try { results.push(await synchronizeSales(env,fetchImpl)); }
  catch { results.push({kind:'sales',status:'failed'}); }
  return {enabled:true,results};
}
export default {
  scheduled(_event,env,context) {context.waitUntil(runCommunitySync(env));},
  fetch() {return new Response('Not found',{status:404});}
};
