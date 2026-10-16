// Local contract fixture. Never represents a captured or current server catalogue.
const nativeFetch=window.fetch.bind(window);
const state=new URLSearchParams(location.search).get('state')??'connected';
const now=Date.now();
const catalogue={schemaVersion:1,generatedAt:new Date(now-(state==='stale'?3600000:0)).toISOString(),
  stale:state==='stale',limited:true,source:'server_export',items:state==='empty'?[]:[
    {id:'contract:node',name:'Contract test achievement',description:'Simulated provider definition for renderer checks.',category:'Contract test',reward:'',completed:null}
  ]};
window.fetch=async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  const method=init.method??input?.method??'GET';
  if(method!=='GET')return Response.json({error:'preview_actions_are_not_saved'},{status:501});
  if(url.pathname==='/api/community/achievements')return state==='unavailable'
    ?Response.json({error:'community_service_unavailable'},{status:503}):Response.json(catalogue);
  return nativeFetch(input,init);
};
