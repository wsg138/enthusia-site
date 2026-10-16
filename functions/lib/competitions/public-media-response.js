import {json} from '../responses.js';
/** Called only after the public-read and repository visibility checks. */
export function publicCompetitionMediaResponse(media,object){
  if(!object?.body)return json({error:'media_not_found'},404);
  const headers=new Headers({'content-type':media.mimeType,'cache-control':'no-store',
    'content-disposition':'inline','x-content-type-options':'nosniff'});
  if(object.httpEtag)headers.set('etag',object.httpEtag);
  return new Response(object.body,{status:200,headers});
}
