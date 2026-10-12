import { el,link } from './community-dom.js';
export function formattedDate(value){if(!value)return '';const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}):String(value);}
function segments(source){
  const out=[],regex=/(`[^`\n]{1,1000}`|\*\*[^*\n]{1,1000}\*\*|__[^_\n]{1,1000}__|~~[^~\n]{1,1000}~~|\|\|[^|\n]{1,1000}\|\||\*[^*\n]{1,1000}\*|_[^_\n]{1,1000}_|\[[^\]\n]{1,200}\]\([^\n)]{1,500}\))/g;let index=0;
  for(const match of source.matchAll(regex)){
    if(match.index>index)out.push(el('span',{class:'md-t',text:source.slice(index,match.index)}));
    const token=match[0];let cls='md-i',cut=1;if(token.startsWith('**')){cls='md-b';cut=2;}else if(token.startsWith('__')){cls='md-u';cut=2;}else if(token.startsWith('~~')){cls='md-s';cut=2;}else if(token.startsWith('||')){cls='md-sp';cut=2;}else if(token.startsWith('`'))cls='md-c';
    if(token.startsWith('[')){const split=token.indexOf('](');out.push(link(token.slice(split+2,-1),token.slice(1,split),'md-a'));}
    else{const node=el('span',{class:cls,text:token.slice(cut,-cut)});if(cls==='md-sp'){node.setAttribute('role','button');node.setAttribute('tabindex','0');node.setAttribute('aria-expanded','false');const toggle=()=>node.setAttribute('aria-expanded',node.getAttribute('aria-expanded')!=='true');node.addEventListener('click',toggle);node.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();toggle();}});}out.push(node);}
    index=match.index+token.length;
  }if(index<source.length||!out.length)out.push(el('span',{class:'md-t',text:source.slice(index)}));return out;
}
export function renderMarkup(host,source){
  const blocks=[];let code=false;
  for(const original of String(source??'').slice(0,20000).split('\n')){
    if(original.trim().startsWith('```')){code=!code;continue;}
    let cls='md-p',line=original;
    if(code){cls='md-pre';}else if(!line.trim()){cls='md-gap';}else if(line.startsWith('### ')){cls='md-h3';line=line.slice(4);}else if(line.startsWith('## ')){cls='md-h2';line=line.slice(3);}else if(line.startsWith('# ')){cls='md-h1';line=line.slice(2);}else if(line.startsWith('-# ')){cls='md-sub';line=line.slice(3);}else if(line.startsWith('> ')){cls='md-quote';line=line.slice(2);}else if(line.startsWith('- ')||line.startsWith('* ')){cls='md-li';line=line.slice(2);}else if(/^\d+\. /.test(line)){cls='md-ol';}
    blocks.push(el('div',{class:cls},cls==='md-pre'?[el('span',{class:'md-t',text:line||' '})]:segments(line)));
  }host.replaceChildren(...blocks);
}
export function notice(message){let node=document.querySelector('.exact-notice');if(!node){node=el('p',{class:'exact-notice',role:'status'});document.body.append(node);}node.textContent=message;return node;}
