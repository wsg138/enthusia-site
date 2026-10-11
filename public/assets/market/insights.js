import { el,link,button,api,status } from '../community-dom.js';
const host=document.querySelector('[data-market-insights]');
const gold=value=>Number(value).toLocaleString(undefined,{maximumFractionDigits:2});
const key=value=>String(value??'').toLowerCase().replace(/^minecraft:/,'');
let generation=0;
let connectedMap=null;
let applyDeepLink=null;
function unitPrice(shop){return shop.direction==='SELL'&&shop.costItem?.material==='RAW_GOLD'&&shop.sellAmount>0?shop.costAmount/shop.sellAmount:null;}
function badge(shop,prices){
  const current=unitPrice(shop),average=prices.get(key(shop.sellItem?.material));
  if(current===null||!average)return null;const ratio=current/average;
  return {kind:ratio<.9?'cheap':ratio>1.1?'pricey':'fair',text:ratio<.9?'Below market':ratio>1.1?'Above market':'Near market'};
}
function connectMap(data){
  const map=window.EnthusiaMarketMap;if(!map)return;
  const prices=new Map(data.prices.map(v=>[key(v.item),v.price])),totals=new Map(data.stallTotals.map(v=>[v.stall,v.gold]));
  map.shopBadge=shop=>badge(shop,prices);
  if(data.sales)window.EnthusiaMarketLayerProvider={layers:[{id:'prices',label:'Prices',legend:[['free','Below market'],['mixed','Mixed prices'],['out','Above market']]},{id:'weekly-gold',label:'Weekly gold',legend:[['heat1','Recorded sales'],['none','No recorded sales']]}],describe(layer,building,stallsById){
    const stalls=building.stallIds.map(id=>stallsById.get(id)).filter(Boolean);
    if(layer==='weekly-gold'){const amount=stalls.reduce((sum,stall)=>sum+(totals.get(stall.id)??0),0);return {bucket:amount?'heat1':'none',label:gold(amount),line:gold(amount)+' raw gold this week'};}
    const values=stalls.flatMap(s=>s.shops??[]).map(shop=>badge(shop,prices)).filter(Boolean);if(!values.length)return {bucket:'none',label:'?',line:'No comparable raw-gold sales'};
    const cheap=values.filter(v=>v.kind==='cheap').length,pricey=values.filter(v=>v.kind==='pricey').length;
    return {bucket:cheap===values.length?'free':pricey===values.length?'out':'mixed',label:cheap+'/'+values.length,line:cheap+' below market of '+values.length+' comparable shops'};
  }};
  window.EnthusiaMarketLayers?.refresh();
  if(connectedMap===map){applyDeepLink?.();return;}connectedMap=map;
  let appliedHash=null;
  function deepLink(){
    const params=new URLSearchParams(location.hash.slice(1)),snapshot=map.getSnapshot();if(!snapshot)return;
    if(appliedHash===location.hash)return;appliedHash=location.hash;
    if(params.has('stall')){const requested=params.get('stall').toLowerCase().replace(/\s/g,'');const stall=snapshot.stalls.find(v=>v.id.toLowerCase()===requested||('stall'+v.id.replace(/\D/g,''))===requested);if(stall)map.showStall(stall.id);}
    if(params.has('owner')){const owner=params.get('owner').toLowerCase();const stalls=snapshot.stalls.filter(v=>v.owner?.type==='PLAYER'&&v.owner.name?.toLowerCase()===owner);if(stalls[0])map.showStall(stalls[0].id);}
    if(params.has('item')){const field=document.querySelector('#item-search');if(field){field.value=params.get('item');field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));}}
  }
  applyDeepLink=deepLink;deepLink();map.subscribe(deepLink);window.addEventListener('hashchange',deepLink);
}
function chart(host,historyRows){
  if(!historyRows.length){host.append(el('p',{text:'No daily prices recorded for this item.'}));return;}
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 600 220');svg.setAttribute('class','community-chart');svg.setAttribute('role','group');svg.setAttribute('aria-label','Recorded daily raw-gold unit prices');
  const readout=el('p',{role:'status',text:'Focus or touch a point for its daily price.'}),max=Math.max(...historyRows.map(v=>v.price),.001);
  const points=historyRows.map((v,i)=>({x:20+i*(560/Math.max(1,historyRows.length-1)),y:200-v.price/max*180,row:v}));
  const line=document.createElementNS(ns,'polyline');line.setAttribute('points',points.map(v=>v.x+','+v.y).join(' '));svg.append(line);
  for(const point of points){const node=document.createElementNS(ns,'circle');for(const [k,v]of Object.entries({cx:point.x,cy:point.y,r:6,tabindex:0,role:'button','aria-label':point.row.day+': '+gold(point.row.price)+' raw gold'}))node.setAttribute(k,v);const show=()=>readout.textContent=point.row.day+': '+gold(point.row.price)+' raw gold per item - '+gold(point.row.quantity)+' traded';for(const event of ['focus','pointerenter','click'])node.addEventListener(event,show);node.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const nodes=[...svg.querySelectorAll('circle')];nodes[Math.max(0,Math.min(nodes.length-1,nodes.indexOf(node)+(event.key==='ArrowLeft'?-1:1)))].focus();}});svg.append(node);}
  host.append(svg,readout);
}
function shareWinner(winner,week){
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=630;const ctx=canvas.getContext('2d');ctx.fillStyle='#a51b16';ctx.fillRect(0,0,1200,630);ctx.strokeStyle='#ffcf1f';ctx.lineWidth=12;ctx.strokeRect(24,24,1152,582);ctx.fillStyle='#ffcf1f';ctx.font='bold 48px Minecraft, monospace';ctx.textAlign='center';ctx.fillText('ENTHUSIA - STALL OF THE WEEK',600,140);ctx.font='bold 58px Minecraft, monospace';ctx.fillText(winner.name.slice(0,30),600,290,1080);ctx.fillStyle='#fff1cf';ctx.font='36px Minecraft, monospace';ctx.fillText(gold(winner.gold)+' raw gold',600,390);ctx.fillText('Week of '+week.slice(0,10),600,470);canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='enthusia-stall-of-the-week.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
}
async function render(){
  if(!host)return;const id=++generation;host.replaceChildren();const message=status(host,'Loading recorded market sales...');
  const params=new URLSearchParams(location.hash.slice(1));
  try{
    const query=new URLSearchParams({week:host.dataset.week??'',mode:host.dataset.mode??'stall',item:params.get('item')??''});
    const data=await api('insights?'+query);if(id!==generation)return;host.replaceChildren();
    status(host,data.sales?'Recorded sales only. Prices are quantity-weighted averages over 30 days. UTC weeks start Monday.':'No sales have been exported yet. Shop stock is not sales history.');
    if(host.dataset.marketInsights==='home'){const winner=data.leaders[0];host.append(el('h2',{text:'At the Market'}),el('p',{text:winner?winner.name+' leads this week with '+gold(winner.gold)+' raw gold':'Trade at player shops and explore the market.'}),link('market.html#stall-week','Stall of the Week'),link('market.html#price-tracker','Price Tracker'));return;}
    const controls=el('div',{class:'community-toolbar'}),week=el('select',{'aria-label':'Sales week'});
    const weeks=new Set([data.week.slice(0,10),...data.weeks]);for(const value of weeks)week.append(el('option',{value,text:'Week of '+value}));week.value=data.week.slice(0,10);week.addEventListener('change',()=>{host.dataset.week=week.value;render();});
    controls.append(week,button('Stalls',()=>{host.dataset.mode='stall';render();}),button('Guilds',()=>{host.dataset.mode='guild';render();}));host.append(controls);
    const winner=data.leaders[0],weekly=el('section',{id:'stall-week',class:'tip fret community-detail s-red'},[el('h2',{text:data.mode==='guild'?'Guild of the Week':'Stall of the Week'})]);
    if(winner)weekly.append(el('h3',{text:winner.name}),el('p',{text:gold(winner.gold)+' raw gold'}),data.mode==='stall'?link('market.html#stall='+encodeURIComponent(winner.name),'Open stall'):null,button('Download share card',()=>shareWinner(winner,data.week)));
    for(const [index,row]of data.leaders.entries())weekly.append(el('p',{text:(index+1)+'. '+row.name+' - '+gold(row.gold)+' raw gold'+(row.streak>1?' - Top-five streak: '+row.streak+' weeks':'')}));
    const hall=el('details',{},[el('summary',{text:'Weekly hall of fame'})]);for(const row of data.hallOfFame)hall.append(el('p',{text:row.week+' - '+row.winner.name+' - '+gold(row.winner.gold)+' raw gold'}));weekly.append(hall);host.append(weekly);
    const tracker=el('section',{id:'price-tracker',class:'community-card'},[el('h2',{text:'Price Tracker'})]),list=el('div',{class:'community-list'}),graph=el('div');
    const search=el('input',{type:'search',placeholder:'Search item','aria-label':'Search price tracker'}),sort=el('select',{'aria-label':'Sort prices'},['Most traded','Risers','Fallers'].map(text=>el('option',{value:text,text})));
    const prices=()=>{let rows=data.prices.filter(row=>row.item.toLowerCase().includes(search.value.toLowerCase()));rows.sort((a,b)=>sort.value==='Risers'?(b.change??-Infinity)-(a.change??-Infinity):sort.value==='Fallers'?(a.change??Infinity)-(b.change??Infinity):b.quantity-a.quantity);list.replaceChildren(...rows.map(row=>button(row.item+' - '+gold(row.price)+' raw gold'+(row.change===null?'':' - '+gold(row.change)+'% vs preceding 30 days'),()=>{history.replaceState(null,'','#item='+encodeURIComponent(row.item));render();},'community-row')));};
    search.addEventListener('input',prices);sort.addEventListener('change',prices);tracker.append(el('div',{class:'community-toolbar'},[search,sort]),list,graph);host.append(tracker);prices();
    if(params.get('item')){graph.append(el('h3',{text:params.get('item')+' - daily prices'}));chart(graph,data.history);const threshold=el('input',{type:'number',min:'.000001',step:'any','aria-label':'Alert at or below raw gold per item'}),note=status(graph,'Price alerts require a linked Discord account.');graph.append(el('label',{text:'Alert at or below raw gold per item'},[threshold]),button('Enable Discord price alert',async()=>{try{await api('alerts',{method:'POST',body:JSON.stringify({item:params.get('item'),threshold:Number(threshold.value)})});note.textContent='Alert saved. Delivery requires the market alert worker to be enabled.';}catch(error){note.textContent=error.message;}}),button('Remove price alert',async()=>{try{await api('alerts',{method:'POST',body:JSON.stringify({item:params.get('item'),remove:true})});note.textContent='Alert removed.';}catch(error){note.textContent=error.message;}}));}
    connectMap(data);
  }catch(error){message.textContent=error.message;connectMap({prices:[],stallTotals:[],sales:0});}
}
render();
