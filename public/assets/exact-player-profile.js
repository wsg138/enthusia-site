import {el,link} from './community-dom.js';
export function playerHead(item,size=64) {
  const identity=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(item.id)?item.id:item.name;
  const head=el('img',{src:'https://mc-heads.net/avatar/'+encodeURIComponent(identity)+'/'+size,
    alt:item.name+' Minecraft head',width:size,height:size,loading:'lazy',
    style:'image-rendering:pixelated;flex:none;max-width:100%'});
  head.addEventListener('error',()=>{head.src=new URL('./market/player-head-base.svg',import.meta.url).href;},{once:true});
  return head;
}
export function playerProfile(node,item) {
  const name=el('div',{},[el('p',{text:'PLAYER PROFILE'}),el('h3',{text:item.name,
    style:'font-size:36px;line-height:44px;overflow-wrap:anywhere'})]);
  node.replaceChildren(el('div',{style:'display:flex;gap:20px;align-items:center;flex-wrap:wrap'},[playerHead(item),name]));
  const values=[['Balance',item.balance],['Active playtime',item.playtime===null||item.playtime===undefined?null:
    item.playtime.toLocaleString('en-US',{maximumFractionDigits:1})+' hours']];
  const available=values.filter(([,value])=>value!==null&&value!==undefined);
  node.append(el('div',{class:'stats',style:'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:16px'},
    available.map(([label,value])=>el('div',{class:'stat',style:'padding:16px;display:flex;flex-direction:column;gap:8px;min-width:0'},[
      el('b',{text:typeof value==='number'?value.toLocaleString('en-US'):value,style:'font-size:24px;line-height:32px;overflow-wrap:anywhere'}),el('span',{text:label})]))));
  if(item.guild)node.append(el('p',{text:'Guild: '+item.guild}));
  if(item.rank)node.append(el('p',{text:'Rank: '+item.rank}));
  if(item.achievements?.length)node.append(el('h3',{text:'Achievements'}),el('ul',{class:'plain'},item.achievements.map(name=>el('li',{text:name}))));
  node.append(link('market.html#owner='+encodeURIComponent(item.name),'View public market stalls','btn btn-gold'));
  for(const entry of item.links??[])node.append(link(entry.url,entry.label,'btn btn-dark'));
}
