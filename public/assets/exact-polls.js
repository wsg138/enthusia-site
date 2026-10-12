import { api,el } from './community-dom.js';
import { formattedDate,notice } from './exact-markup.js';
const preview=document.documentElement.hasAttribute('data-preview-root');
const root=document.querySelector('#exact-active-polls'),template=document.querySelector('#exact-poll-template');
const closed=document.querySelector('[data-b-class*="closedShow"]');closed.hidden=true;
async function start(){
  try{
    const records=(await api('polls')).items;const active=records.filter(item=>Date.parse(item.closesAt)>Date.now());
    closed.hidden=active.length>0;
    for(const record of active){const node=template.content.firstElementChild.cloneNode(true),column=node.lastElementChild,prototype=column.querySelector('.opt');
      if(!preview){node.querySelector('h3').textContent=record.title;node.querySelector('p').textContent=record.body;const end=node.querySelector('.tag-dark');if(end)end.textContent='Closes '+formattedDate(record.closesAt);}
      const data=await api('polls/'+encodeURIComponent(record.slug));const line=node.querySelector('[data-b-text="voteLine"]');line.textContent='Pick an option. You can change it until the poll closes.';
      column.querySelectorAll('.opt').forEach(option=>option.remove());
      record.options.forEach((label,index)=>{const option=prototype.cloneNode(true);option.children[0].textContent=label;option.setAttribute('aria-pressed',String(data.choice===index));option.children[1].textContent=data.choice===index?'Your vote':'';
        option.addEventListener('click',async()=>{const choices=[...column.querySelectorAll('.opt')];choices.forEach(peer=>peer.disabled=true);try{await api('polls/'+encodeURIComponent(record.slug),{method:'POST',body:JSON.stringify({choice:index})});for(const peer of choices){peer.setAttribute('aria-pressed','false');peer.children[1].textContent='';}option.setAttribute('aria-pressed','true');option.children[1].textContent='Your vote';line.textContent='Vote saved. Results are shown when the poll closes.';}catch(error){line.textContent=error.message;}finally{choices.forEach(peer=>peer.disabled=false);}});column.insertBefore(option,line.parentElement);
      });root.append(node);
    }
    const past=document.querySelector('#exact-poll-history');
    if(preview)past.parentElement.append(past.content.cloneNode(true));
    else for(const record of records.filter(item=>Date.parse(item.closesAt)<=Date.now())){const data=await api('polls/'+encodeURIComponent(record.slug));const card=el('article',{class:'panel',style:'padding:24px;display:flex;flex-direction:column;gap:12px'},[el('h3',{text:record.title}),el('p',{text:formattedDate(record.closesAt)})]);record.options.forEach((label,index)=>card.append(el('p',{text:label+' - '+(data.totals?.find(value=>value.choice===index)?.votes??0)+' votes'})));past.parentElement.append(card);}
  }catch(error){root.append(el('p',{class:'panel exact-empty',role:'status',text:error.message}));}
}
start().catch(error=>notice(error.message));
