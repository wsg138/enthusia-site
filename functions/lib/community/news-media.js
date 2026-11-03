import { inspectCompetitionImage, competitionImageLimits } from '../competitions/media-policy.js';
import { json } from '../responses.js';

const prefix='news-media/';
const validId=/^[a-f0-9]{32}$/;

async function bytes(request,limit){
  if(Number(request.headers.get('content-length')||0)>limit)throw new Error('image_too_large');
  const reader=request.body?.getReader();if(!reader)throw new Error('missing_image');
  const chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new Error('image_too_large');}chunks.push(value);}
  const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}return data;
}

export async function uploadNewsMedia(request,env,actor){
  if(!actor)return json({error:'editor_role_required'},403);
  if(!env.COMPETITIONS_MEDIA?.put)return json({error:'news_media_unavailable'},503);
  let data;try{data=await bytes(request,competitionImageLimits().maxBytes);}catch(error){return json({error:error.message},error.message==='image_too_large'?413:400);}
  const inspected=inspectCompetitionImage(data);
  if(!inspected.ok)return json({error:inspected.error},400);
  const id=crypto.randomUUID().replace(/-/g,'');
  await env.COMPETITIONS_MEDIA.put(prefix+id,data,{httpMetadata:{contentType:inspected.mimeType},customMetadata:{owner:actor.id}});
  return json({url:'/api/community/news-media/'+id,width:inspected.width,height:inspected.height},201);
}

async function mayRead(request,env,url,editor){
  const published=await env.COMMUNITY_DB.prepare("SELECT 1 AS present FROM community_records WHERE kind='news' AND status='published' AND (json_extract(payload,'$.image')=? OR instr(json_extract(payload,'$.body'),?)>0) LIMIT 1").bind(url,url).first();
  if(published)return true;
  try{return Boolean(await editor(request,env));}catch{return false;}
}
export async function readNewsMedia(request,env,id,editor){
  if(!validId.test(id)||!env.COMMUNITY_DB||!env.COMPETITIONS_MEDIA?.get)return json({error:'not_found'},404);
  const url='/api/community/news-media/'+id;
  if(!await mayRead(request,env,url,editor))return json({error:'not_found'},404);
  const object=await env.COMPETITIONS_MEDIA.get(prefix+id);if(!object)return json({error:'not_found'},404);
  const type=object.httpMetadata?.contentType;
  if(!['image/png','image/jpeg'].includes(type))return json({error:'not_found'},404);
  return new Response(object.body,{headers:{'content-type':type,'x-content-type-options':'nosniff','cache-control':'private, no-store','content-security-policy':"default-src 'none'; sandbox"}});
}
