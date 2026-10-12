import { priceVerdict } from './exact-prices.js';
import { api,el } from '../community-dom.js';
const preview=document.documentElement.hasAttribute('data-preview-root');
window.EnthusiaMarketDesignApi=api;
window.EnthusiaMarketPriceVerdict=priceVerdict;
function week(offset=0){const value=new Date();value.setUTCHours(0,0,0,0);value.setUTCDate(value.getUTCDate()-((value.getUTCDay()+6)%7)+offset*7);return value.toISOString().slice(0,10);}
function itemName(key){return key.replace(/^minecraft:/,'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());}
async function start(){
  try{
    let model;
    if(preview){model=await api('market-design');model.preview=true;}
    else {
      const [current,previous]=await Promise.all([api('insights'),api('insights?week='+week(-1))]);
      const row=value=>({...value,stall:value.name,sales:value.quantity,best:[]});
      const winners=previous.hallOfFame.map(record=>({...row(record.winner),week:record.week}));
      const items=current.prices.map(value=>({key:value.item,name:itemName(value.item),price:value.price,sales:value.quantity,days:[],d1:null,d7:value.change,lo:value.price,hi:value.price,mean:value.price}));
      model={weeks:current.weeks,currentWeek:current.week,winners,live:current.leaders.map(row),items,boards:{'-1':previous.leaders.map(row)},stallTotals:Object.fromEntries(current.stallTotals.map(value=>[value.stall,value.gold]))};
      window.EnthusiaMarketDesignLoadWeek=async (offset,mode)=>{const data=await api('insights?week='+week(offset)+'&mode='+mode);const rows=data.leaders.map(row);const key=String(offset);if(mode==='guild'){model.guildBoards??={};model.guildBoards[key]=rows;}else model.boards[key]=rows;return rows;};
      window.EnthusiaMarketDesignLoadHistory=async item=>{
        if(item.loading||item.loaded)return;item.loading=true;
        try{const data=await api('insights?item='+encodeURIComponent(item.key));item.days=data.history.map(value=>({day:value.day,avg:value.price,lo:value.price,hi:value.price}));item.loaded=true;
          if(item.days.length){item.lo=Math.min(...item.days.map(value=>value.avg));item.hi=Math.max(...item.days.map(value=>value.avg));window.EnthusiaMarketDesignRefresh();}
        }catch(error){document.querySelector('#mi-detail')?.append(el('p',{role:'status',text:error.message}));}finally{item.loading=false;}
      };
      document.querySelector('#mi-title')?.parentElement.querySelector('p:last-child')?.replaceChildren('Recorded sales, Monday to Sunday in UTC. The completed winner is shown when that week ends.');
      for(const label of document.querySelectorAll('.mi-head .h7'))label.textContent='30d change';
    }
    window.EnthusiaMarketDesignModel=model;
    const script=document.createElement('script');script.src=new URL('./exact-view.js',import.meta.url).href;document.body.append(script);
  }catch(error){for(const id of ['mi-strip','mi-winner','mi-week','mi-rows','mi-detail'])document.getElementById(id)?.replaceChildren(el('p',{class:'mi-empty',role:'status',text:error.message}));}
}
start();
