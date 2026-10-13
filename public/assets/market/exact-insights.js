import { priceVerdict } from './exact-prices.js';
import { findMarketItem } from './exact-items.js';
import { api,el } from '../community-dom.js';
import { marketHistoryModel,applyMarketHistory,marketMovers,historyPosition,nearestHistoryIndex,previousMarketWinner } from './history-model.js?v=2';
import { drawMarketShareCard } from './share-card.js';
import { drawHistoryChart } from './history-chart.js';
const preview=document.documentElement.hasAttribute('data-preview-root');
window.EnthusiaMarketDesignApi=api;
window.EnthusiaMarketPriceVerdict=priceVerdict;
window.EnthusiaMarketFindItem=findMarketItem;
window.EnthusiaMarketHistory={marketMovers,historyPosition,nearestHistoryIndex,previousMarketWinner};
window.EnthusiaMarketDrawShareCard=drawMarketShareCard;
window.EnthusiaMarketDrawHistoryChart=drawHistoryChart;
function week(offset=0){const value=new Date();value.setUTCHours(0,0,0,0);value.setUTCDate(value.getUTCDate()-((value.getUTCDay()+6)%7)+offset*7);return value.toISOString().slice(0,10);}
async function loadHistory(item){
  if(item.loading||item.loaded)return;item.loading=true;
  try{
    const data=await api('insights?item='+encodeURIComponent(item.key));
    applyMarketHistory(item,data.history);window.EnthusiaMarketDesignRefresh();
  }catch(error){window.EnthusiaMarketDesignHistoryError?.(item,error.message);}
  finally{item.loading=false;}
}
function installLiveLoaders(model){
  window.EnthusiaMarketDesignLoadWeek=async(offset,mode)=>{
    const data=await api('insights?week='+week(offset)+'&mode='+mode);
    const rows=data.leaders.map(value=>({...value,stall:value.name,sales:value.quantity,best:[]}));
    const boards=mode==='guild'?(model.guildBoards??={}):model.boards;
    boards[String(offset)]=rows;return rows;
  };
  window.EnthusiaMarketDesignLoadHistory=loadHistory;
}
async function start(){
  try{
    let model;
    if(preview){model=await api('market-design');model.preview=true;}
    else {
      const [current,previous]=await Promise.all([api('insights'),api('insights?week='+week(-1))]);
      model=marketHistoryModel(current,previous);installLiveLoaders(model);
      document.querySelector('#mi-title')?.parentElement.querySelector('p:last-child')?.replaceChildren('Recorded sales, Monday to Sunday in UTC. The completed winner is shown when that week ends.');
      for(const label of document.querySelectorAll('.mi-head .h7'))label.textContent='30d change';
      for(const label of document.querySelectorAll('.mi-head .hs'))label.textContent='Recorded days';
      const notes=document.querySelectorAll('#price-tracker .mi-note');
      for(const note of notes)note.textContent='Material averages from completed SELL transactions. Item variants and historical stall or guild ownership may be unavailable.';
      const legacyNote=document.querySelector('#price-tracker>p:last-child');
      if(legacyNote?.textContent.includes('Stand-in numbers'))legacyNote.textContent='Recorded sales only. Missing history stays unavailable.';
    }
    window.EnthusiaMarketDesignModel=model;
    // Standings may omit banners; join only public guild profiles, without blocking sales data.
    const guilds=await api('guilds').catch(()=>({items:[]}));
    model.guildBanners=new Map(guilds.items.filter(guild=>guild.banner).map(guild=>[guild.name.toLowerCase(),guild.banner]));
    const script=document.createElement('script');script.src=new URL('./exact-view.js',import.meta.url).href;document.body.append(script);
  }catch(error){for(const id of ['mi-strip','mi-winner','mi-week','mi-rows','mi-detail'])document.getElementById(id)?.replaceChildren(el('p',{class:'mi-empty',role:'status',text:error.message}));}
}
start();
