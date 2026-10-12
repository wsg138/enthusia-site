import { handleCommunity } from '../../lib/community/service.js';
export function onRequest(context){return handleCommunity(context);}
