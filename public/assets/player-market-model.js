const uuid=value=>String(value??'').toLowerCase().replaceAll('-','');
export function ownedPlayerStalls(snapshot,player) {
  if(!Array.isArray(snapshot?.stalls)||snapshot.stalls.length>1000)throw new Error('invalid_market_snapshot');
  return snapshot.stalls.filter(stall=>stall.owner?.type==='PLAYER'&&uuid(stall.owner.uuid??stall.owner.id)===uuid(player.id))
    .map(stall=>({id:String(stall.id),shops:Array.isArray(stall.shops)?stall.shops.length:0,
      types:[...new Set((stall.shops??[]).map(shop=>({SELL:'Selling',BUY:'Buying',TRADE:'Trading'})[shop.direction]).filter(Boolean))]}));
}
