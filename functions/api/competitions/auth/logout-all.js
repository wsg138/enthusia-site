import {competitionsEnabled,hasCompetitionDatabase} from '../../../lib/competitions/access.js';
import {clearCompetitionSessionCookie,deleteAllCompetitionIdentitySessions} from '../../../lib/competitions/identity.js';
import {json,methodNotAllowed,unauthorized} from '../../../lib/responses.js';
import {requireSameOrigin} from '../../../lib/security.js';

export async function onRequestPost(context) {
  if(!requireSameOrigin(context.request))return json({error:'invalid_origin'},403);
  if(!competitionsEnabled(context.env))return json({error:'not_found'},404);
  if(!hasCompetitionDatabase(context.env))return json({error:'competition_database_unavailable'},503);
  try {
    const count=await deleteAllCompetitionIdentitySessions(context.request,context.env.COMPETITIONS_DB);
    if(!count)return unauthorized();
    return json({status:'SIGNED_OUT_ALL_DEVICES'},200,{'set-cookie':clearCompetitionSessionCookie()});
  } catch {return json({error:'session_revocation_unavailable'},503);}
}
export function onRequest() {return methodNotAllowed(['POST']);}
