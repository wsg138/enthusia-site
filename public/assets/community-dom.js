import { communityApiPath } from './community-route.js';

export function el(tag,attributes={},children=[]){
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(attributes)){
    if(key==='text')node.textContent=String(value??'');
    else if(key==='class')node.className=value;
    else if(key.startsWith('on'))node.addEventListener(key.slice(2),value);
    else if(value!==null&&value!==undefined)node.setAttribute(key,key==='src'&&String(value).startsWith('/assets/')?new URL(String(value).slice(8),import.meta.url).href:String(value));
  }
  node.append(...children.filter(Boolean));return node;
}
export function link(url,label,className='btn btn-gold'){
  let parsed;try{parsed=String(url).startsWith('/assets/')?new URL(String(url).slice(8),import.meta.url):new URL(url,location.href);}catch{return el('span',{text:label});}
  if(!['https:','http:'].includes(parsed.protocol))return el('span',{text:label});
  return el('a',{href:parsed.href,class:className,text:label,...(parsed.origin!==location.origin?{target:'_blank',rel:'noopener noreferrer'}:{})});
}
export function button(label,action,className='btn btn-gold'){return el('button',{type:'button',class:className,text:label,onclick:action});}
export async function api(path,options={}){
  const response=await fetch(communityApiPath(path),{...options,credentials:'same-origin',redirect:'error',headers:{'content-type':'application/json',...options.headers}});
  let payload;try{payload=await response.json();}catch{throw new Error('Service returned an invalid response.');}
  if(!response.ok)throw new Error(new Map([['community_service_unavailable','Data is unavailable. Try again later.'],['revision_conflict','This record changed. Reload it before saving.'],['linked_account_required','Sign in with Discord and link your Minecraft account first.'],['poll_closed_or_changed','This poll has closed or changed. Reload to see its results.'],['preview_actions_are_not_saved','Preview only: this action is not saved.']]).get(payload.error)??'The request could not be completed.');
  return payload;
}
export function status(host,message){const p=el('p',{class:'community-status',role:'status',text:message});host.append(p);return p;}
function inline(host,source){
  // Bounded, flat token parsing: content is always DOM text, never HTML.
  const regex=/(`[^`\n]{1,1000}`|\*\*[^*\n]{1,1000}\*\*|__[^_\n]{1,1000}__|~~[^~\n]{1,1000}~~|\|\|[^|\n]{1,1000}\|\||\*[^*\n]{1,1000}\*|\[[^\]\n]{1,200}\]\([^\n)]{1,500}\))/g;
  let offset=0;
  for(const match of source.matchAll(regex)){
    host.append(document.createTextNode(source.slice(offset,match.index)));const token=match[0];let node;
    if(token.startsWith('[')){const split=token.indexOf('](');node=link(token.slice(split+2,-1),token.slice(1,split),'');}
    else if(token.startsWith('||')){node=button(token.slice(2,-2),()=>node.setAttribute('aria-expanded',node.getAttribute('aria-expanded')!=='true'),'spoiler');node.setAttribute('aria-expanded','false');node.setAttribute('aria-label','Reveal spoiler');}
    else{const pair=token.startsWith('**')?'strong':token.startsWith('__')?'u':token.startsWith('~~')?'s':token.startsWith('`')?'code':'em';const cut=['strong','u','s'].includes(pair)?2:1;node=el(pair,{text:token.slice(cut,-cut)});}
    host.append(node);offset=match.index+token.length;
  }host.append(document.createTextNode(source.slice(offset)));
}
export function markdown(source){
  const host=el('div',{class:'community-md'});let code=null;
  for(const line of String(source??'').slice(0,20000).split('\n')){
    if(line.startsWith('```')){if(code)code=null;else{code=el('pre');host.append(code);}continue;}
    if(code){code.append(document.createTextNode(line+'\n'));continue;}
    const heading=line.match(/^(#{1,3}) /);let node;
    if(heading)node=el('h'+(heading[1].length+1));else if(line.startsWith('> '))node=el('blockquote');else if(line.startsWith('-# '))node=el('small');else node=el('p');
    inline(node,line.replace(/^(#{1,3} |> |-# )/,''));host.append(node);
  }return host;
}
