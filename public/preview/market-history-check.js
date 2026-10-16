// Explicit synthetic ledger contract check; never publish this as current sales.
const marketCheckFetch=window.fetch.bind(window);
const marketCheckState=new URLSearchParams(location.search).get('state')??'connected';
let marketCheckData;
window.fetch=async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if((init.method??input?.method??'GET')!=='GET')return Response.json({error:'preview_actions_are_not_saved'},{status:501});
  if(url.pathname==='/api/community/guilds'||url.pathname==='/api/community/alerts')return Response.json({items:[]});
  if(url.pathname!=='/api/community/insights')return marketCheckFetch(input,init);
  if(marketCheckState==='unavailable')return Response.json({error:'community_service_unavailable'},{status:503});
  marketCheckData??=marketCheckFetch('market-history-check-data.json').then(response=>response.json());
  const rows=await marketCheckData,source=rows[url.searchParams.get('item')??'']??rows[''];
  const data={...source,week:url.searchParams.get('week')?new Date(url.searchParams.get('week')).toISOString():source.week,
    mode:url.searchParams.get('mode')??'stall'};
  if(marketCheckState==='empty')Object.assign(data,{prices:[],history:[],leaders:[],stallTotals:[],hallOfFame:[],weeks:[],sales:0,updatedAt:null});
  return Response.json(data);
};
