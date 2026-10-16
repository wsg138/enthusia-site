export function selectedMarketStall(stalls,params) {
  let selection=null;
  if(params.has('stall')) {
    const requested=params.get('stall').toLowerCase().replace(/\s/g,'');
    selection=stalls.find(row=>row.id.toLowerCase()===requested||('stall'+row.id.replace(/\D/g,''))===requested)??null;
  }
  if(params.has('owner')) {
    const requested=params.get('owner').toLowerCase();
    selection=stalls.find(row=>row.owner?.type==='PLAYER'&&row.owner.name?.toLowerCase()===requested)??selection;
  }
  return selection;
}
