import {projectSnapshot} from './community/contracts.js';
const guildId=value=>typeof value==='string'&&/^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(value)?value.toLowerCase().replaceAll('-',''):null;
function banner(value){try{return projectSnapshot('guilds',{items:[{id:'banner',name:'Guild',banner:value}]}).items[0].banner;}catch{return null;}}
export function enrichGuildBanners(payload,snapshot){
  if(!Array.isArray(payload?.entries)||!Array.isArray(snapshot?.stalls)||snapshot.stalls.length>1000)return payload;
  const designs=new Map(),conflicts=new Set();
  for(const stall of snapshot.stalls){
    const owner=stall?.owner;if(owner?.type!=='GUILD'||owner.avatar?.kind!=='GUILD_BANNER')continue;
    const id=guildId(owner.id),design=banner(owner.avatar.banner);if(!id||!design)continue;
    if(designs.has(id)&&JSON.stringify(designs.get(id))!==JSON.stringify(design))conflicts.add(id);
    designs.set(id,design);
  }
  return {...payload,entries:payload.entries.map(row=>{
    const own=banner(row.banner),id=guildId(row.id),design=own??(!conflicts.has(id)?designs.get(id):null);
    return design?{...row,banner:design}:row;
  })};
}
export async function publicMarketBanners(payload,fetcher=fetch){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),3000);
  try{
    // Separate public request: never forward guild API bearer or Access credentials.
    const response=await fetcher('https://market-api.enthusia.info/v1/market',{headers:{Accept:'application/json'},redirect:'error',signal:controller.signal});
    if(!response.ok)return payload;
    return enrichGuildBanners(payload,await response.json());
  }catch{return payload;}finally{clearTimeout(timeout);}
}
