const normalized=value=>String(value??'').trim().replace(/^minecraft:/i,'').replaceAll('_',' ').toLowerCase();
export function findMarketItem(items,value){
  const key=normalized(value);
  if(!key)return undefined;
  return items.find(item=>normalized(item.key)===key||normalized(item.name)===key);
}
