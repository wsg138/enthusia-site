import { SNAPSHOT_KINDS, projectSnapshot,validateSale } from './contracts.js';
const MAX_BYTES=150000;
function configuration(kind,env) {
  if(!SNAPSHOT_KINDS.has(kind)&&kind!=='sales')return null;
  const prefix='COMMUNITY_'+kind.toUpperCase()+'_API';
  try {
    const url=new URL(env[prefix+'_URL']);
    if(url.protocol!=='https:'||url.username||url.password||url.hash)return null;
    if(!url.hostname.includes('.')||url.hostname.includes(':')||/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)
      ||/\.(local|localhost|internal|test)$/.test(url.hostname))return null;
    const token=String(env[prefix+'_TOKEN']??'');
    if(/[\r\n]/.test(token)||token.length>8192)return null;
    return {url,headers:{accept:'application/json',...(token?{authorization:'Bearer '+token}:{})}};
  } catch { return null; }
}
async function boundedJson(response) {
  if(!response.ok||Number(response.headers.get('content-length'))>MAX_BYTES)return null;
  if(!response.headers.get('content-type')?.includes('application/json'))return null;
  const reader=response.body?.getReader();if(!reader)return null;
  const chunks=[];let size=0;
  for(;;) {
    const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();return null;}
    chunks.push(value);
  }
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function readCommunityUpstream(kind,env,fetchImpl=fetch,now=Date.now()) {
  if(kind==='sales')return null;
  const config=configuration(kind,env);if(!config)return null;
  try {
    const response=await fetchImpl(config.url,{method:'GET',headers:config.headers,
      redirect:'error',signal:globalThis.AbortSignal.timeout(5000)});
    const input=await boundedJson(response);if(!input)return null;
    const generated=Date.parse(input.generatedAt);
    if(!Number.isFinite(generated)||generated>now+60000)return null;
    const data=projectSnapshot(kind,input),updatedAt=new Date(generated).toISOString();
    return {...data,updatedAt,stale:now-generated>900000,source:'configured_upstream',limited:input.complete!==true};
  } catch { return null; }
}

export async function readCommunitySales(env,fetchImpl=fetch,now=Date.now(),cursor=null) {
  const config=configuration('sales',env);if(!config)return null;
  try {
    if(cursor!==null) {
      if(typeof cursor!=='string'||!/^[A-Za-z0-9_.:-]{1,80}$/.test(cursor))return null;
      config.url.searchParams.set('after',cursor);
    }
    const response=await fetchImpl(config.url,{method:'GET',headers:config.headers,
      redirect:'error',signal:globalThis.AbortSignal.timeout(5000)});
    const input=await boundedJson(response);
    if(!Array.isArray(input?.items)||input.items.length>250)return null;
    if(input.nextCursor!==null&&(typeof input.nextCursor!=='string'||!/^[A-Za-z0-9_.:-]{1,80}$/.test(input.nextCursor)))return null;
    if(input.nextCursor!==null&&input.nextCursor===cursor)return null;
    if(input.items.some(row=>!['SELL','BUY'].includes(row.direction)||row.currency!=='RAW_GOLD'))return null;
    return {kind:'sales',items:input.items.filter(row=>row.direction==='SELL').map(row=>validateSale(row,now)),nextCursor:input.nextCursor};
  } catch { return null; }
}
