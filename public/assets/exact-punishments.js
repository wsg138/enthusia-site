export function exactPunishmentCard(item,date,duration){
  const preview=document.documentElement.hasAttribute('data-preview-root');
  const template=document.querySelector('#exact-punishment-'+(preview?item.designIndex??0:0));
  const node=template.content.firstElementChild.cloneNode(true);
  if(preview&&item.designIndex!==undefined)return node;
  node.removeAttribute('data-b-class');node.querySelector('h2').textContent=item.player||'Unknown player';
  node.querySelector('div>div>p').textContent=item.punishmentType||'Punishment';
  const state=node.querySelector('.tag');state.textContent=item.state||'Unknown';state.className='tag '+(item.state==='ACTIVE'?'tag-red':'tag-plain');
  node.querySelector(':scope>p').textContent=item.publicReason||item.broadReason||'No public reason is available.';
  const values=[date(item.issuedAt),item.expiresAt?date(item.expiresAt)+' · '+duration(item.remainingSeconds):'Permanent',item.caseId||'Unavailable'];node.querySelectorAll('dd').forEach((node,index)=>node.textContent=values[index]);
  const link=node.querySelector('a');if(!item.appealAvailable)link.remove();else link.href='/appeal.html#new';return node;
}
