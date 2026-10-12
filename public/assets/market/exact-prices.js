export function rawGoldUnitPrice(shop){
  if(shop?.direction!=='SELL'||shop.costItem?.material!=='RAW_GOLD'||!(shop.sellAmount>0)||!Number.isFinite(shop.costAmount)||shop.costAmount<=0)return null;
  if(shop.sellItem?.metadata&&Object.keys(shop.sellItem.metadata).length)return null;
  return shop.costAmount/shop.sellAmount;
}
export function priceVerdict(shop,average){
  const unit=rawGoldUnitPrice(shop);if(unit===null||!Number.isFinite(average)||average<=0)return null;
  const p=(unit/average-1)*100,kind=p<=-5?'cheap':p>=5?'pricey':'fair';
  return {p,kind,label:kind==='cheap'?'Cheap':kind==='pricey'?'Pricey':'Fair price'};
}
