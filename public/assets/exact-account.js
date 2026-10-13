function linkedAccountRows(panels,session,actions){
    const list=panels[0].querySelector('ul'),prototype=list.firstElementChild;list.replaceChildren();
    if(!(session.linkedMinecraftAccounts??[]).length){const empty=document.createElement('li');empty.className='account-link-empty';empty.textContent=session.networkAccountsPending?'Linked accounts will appear after the server connection is activated.':'No Minecraft accounts are linked yet.';list.append(empty);}
    for(const account of session.linkedMinecraftAccounts??[]){const row=prototype.cloneNode(true);row.querySelector('span').textContent=account.name;row.querySelector('span:last-child').textContent=account.uuid;const button=row.querySelector('button');if(session.networkAccounts){const instruction=document.createElement('span');instruction.textContent='To unlink, run /unlink CONFIRM while playing this account.';button.replaceWith(instruction);}else{button.addEventListener('click',()=>actions.unlink(account,button));}list.append(row);}
}
export function renderExactAccount(root,session,actions){
  const fragment=document.querySelector('#exact-account-template').content.cloneNode(true);
  const out=fragment.querySelector('[data-b-class*="outShow"]'),head=fragment.querySelector('.tip'),grid=fragment.querySelector('[data-b-class="{{inShow}}"]');
  out.hidden=Boolean(session.authenticated);head.hidden=grid.hidden=!session.authenticated;
  const login=out.querySelector('button'),anchor=document.createElement('a');anchor.className=login.className;anchor.textContent=login.textContent;anchor.href=actions.signInHref();login.replaceWith(anchor);
  if(session.authenticated){
    head.querySelector('h2').textContent=session.discord.globalName||session.discord.username;
    head.querySelector('div>p:last-child').textContent='@'+session.discord.username;
    const logout=head.querySelector('button');logout.addEventListener('click',()=>actions.signOut(logout));
    const panels=grid.children;linkedAccountRows(panels,session,actions);
    const link=panels[1],button=link.querySelector('button'),code=link.querySelector('.swap'),command=code.querySelector('.cmd'),status=code.querySelector('p:last-child');code.hidden=true;
    if(session.networkAccountsPending){button.disabled=true;link.querySelector('p').textContent='Linking will be available after the server connection is activated.';}
    button.addEventListener('click',()=>{code.hidden=false;actions.startLink(button,command,status);});
    const claim=panels[2],liveClaim=actions.punishmentClaimSection(session);claim.replaceChildren(...liveClaim.children);
    for(const label of claim.querySelectorAll('label'))label.className='f';for(const input of claim.querySelectorAll('input,select'))input.className='field';claim.querySelector('button')?.classList.add('btn-gold');
    const bindings=panels[3];bindings.querySelector('[id]')?.removeAttribute('id');bindings.id='account-punishment-bindings';bindings.replaceChildren();
  }
  root.replaceChildren(fragment);
  window.dispatchEvent(new Event('enthusia:account-rendered'));
}
