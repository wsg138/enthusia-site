const DAY=86400000;
export function saleItemName(key){return key.replace(/^minecraft:/,'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());}
export function marketHistoryModel(current,previous) {
  const row=value=>({...value,stall:value.name,sales:value.quantity,best:[]});
  return {weeks:current.weeks,currentWeek:current.week,
    winners:previous.hallOfFame.map(record=>({...row(record.winner),week:record.week})),
    live:current.leaders.map(row),items:current.prices.map(value=>({key:value.item,
      name:saleItemName(value.item),price:value.price,sales:value.quantity,days:[],
      d1:null,d7:value.change,lo:value.price,hi:value.price,mean:value.price})),
    boards:{'-1':previous.leaders.map(row)},
    stallTotals:Object.fromEntries(current.stallTotals.filter(value=>value.stall).map(value=>[value.stall,value.gold]))};
}
export function applyMarketHistory(item,rows) {
  item.days=rows.map(value=>({day:value.day,avg:value.price,lo:value.price,hi:value.price}));
  item.loaded=true;
  if(rows.length){item.lo=Math.min(...rows.map(value=>value.price));item.hi=Math.max(...rows.map(value=>value.price));}
}
export function marketMovers(items,direction) {
  return items.filter(item=>Number.isFinite(item.d7)&&(direction==='up'?item.d7>.05:item.d7<-.05))
    .sort((a,b)=>direction==='up'?b.d7-a.d7:a.d7-b.d7);
}
export function historyPosition(days,index,end) {
  const stamp=Date.parse(days[index]?.day);
  if(!Number.isFinite(stamp)||!Number.isFinite(end))return index/Math.max(1,days.length-1);
  return Math.max(0,Math.min(1,(stamp-(end-30*DAY))/(30*DAY)));
}
export function nearestHistoryIndex(days,position,end) {
  let best=0,distance=Infinity;
  for(let index=0;index<days.length;index++){
    const delta=Math.abs(historyPosition(days,index,end)-position);
    if(delta<distance){best=index;distance=delta;}
  }
  return best;
}
export function previousMarketWinner(model) {
  if(model.preview)return model.winners[0];
  const previous=new Date(Date.parse(model.currentWeek)-7*DAY).toISOString().slice(0,10);
  return model.winners.find(winner=>winner.week===previous);
}
