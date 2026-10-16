import {projectAppealMutation} from './appeal-lifecycle.js';
import {serviceUnavailable} from './responses.js';
import {staffApiResponse} from './staff-api.js';

/** Validate the authenticated staff response before mirroring any mutation. */
export async function readOpenAppealMutation(upstream,appealId,claimed) {
  if(!upstream.ok)return staffApiResponse(upstream,'private, no-store');
  let payload;
  try{payload=await upstream.json();}catch{return serviceUnavailable();}
  const appeal=projectAppealMutation(payload,appealId);
  if(!appeal||appeal.claimed!==claimed||appeal.status!=='OPEN')return serviceUnavailable();
  return appeal;
}
