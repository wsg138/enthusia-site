import { readSalesV2 } from './upstream.js';
import { buildFencedSalesPage } from './sales-generation-fence.js';

// Polling requires an active generation and cannot rotate or reconcile it.
export async function synchronizeSalesV2(env, fetchImpl=fetch) {
  const db=env.COMMUNITY_DB, source=env.COMMUNITY_SALES_API_URL;
  if(!db||typeof source!=='string')return {kind:'sales',status:'unavailable',records:0};
  let records=0;
  try {
    const state=await db.prepare('SELECT generation,revision,mode FROM market_generation_state WHERE id=1').first();
    if(!state||state.mode!=='active'||!Number.isSafeInteger(state.revision)||state.revision<0)
      return {kind:'sales',status:'reconcile_required',records};
    const saved=await db.prepare("SELECT payload FROM community_snapshots WHERE kind='sales_cursor'").first();
    const checkpoint=saved?JSON.parse(saved.payload):null;
    if(checkpoint&&(checkpoint.source!==source||checkpoint.generation!==state.generation||
      typeof checkpoint.cursor!=='string'||!/^\d{1,19}$/.test(checkpoint.cursor)))
      return {kind:'sales',status:'reconcile_required',records};
    const discovery=await readSalesV2(env,fetchImpl);
    if(!discovery)return {kind:'sales',status:'unavailable',records};
    if(discovery.generation!==state.generation)return {kind:'sales',status:'reconcile_required',records};
    let priorCursor=checkpoint?.cursor??null,revision=state.revision;
    for(let count=0;count<4;count++) {
      const page=await readSalesV2(env,fetchImpl,Date.now(),state.generation,priorCursor??'0');
      if(!page)return {kind:'sales',status:'unavailable',records};
      const statements=buildFencedSalesPage(db,{source,generation:state.generation,revision,priorCursor,page});
      const results=await db.batch(statements);
      records+=results.slice(2,2+page.items.length).reduce((sum,row)=>sum+(row.meta.changes??0),0);
      revision++; priorCursor=page.checkpointCursor;
      if(page.nextCursor===null)return {kind:'sales',status:records?'updated':'empty',records};
    }
    return {kind:'sales',status:'backlog',records};
  } catch { return {kind:'sales',status:'failed',records}; }
}
