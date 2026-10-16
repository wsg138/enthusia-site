function linkedAccountRows(panels,session,actions){
    const list=panels[0].querySelector('ul'),prototype=list.firstElementChild;list.replaceChildren();
    if(!(session.linkedMinecraftAccounts??[]).length){const empty=document.createElement('li');empty.className='account-link-empty';empty.textContent=session.networkAccountsPending?'Linked accounts will appear after the server connection is activated.':'No Minecraft accounts are linked yet.';list.append(empty);}
    for(const account of session.linkedMinecraftAccounts??[]){const row=prototype.cloneNode(true);row.querySelector('span').textContent=account.name;row.querySelector('span:last-child').textContent=account.uuid;const button=row.querySelector('button');if(session.networkAccounts){button.remove();}else{button.addEventListener('click',()=>actions.unlink(account,button));}list.append(row);}
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
    const controls=document.createElement('div');controls.className='account-session-actions';
    const allDevices=document.createElement('button');allDevices.type='button';allDevices.className=logout.className;
    allDevices.textContent='Sign out all devices';allDevices.addEventListener('click',()=>actions.signOut(allDevices,true));
    logout.replaceWith(controls);controls.append(logout,allDevices);
    const panels=grid.children;linkedAccountRows(panels,session,actions);
    const link=panels[1],button=link.querySelector('button'),code=link.querySelector('.swap'),command=code.querySelector('.cmd'),status=code.querySelector('p:last-child');code.hidden=true;
    if(session.networkAccounts&&(session.linkedMinecraftAccounts??[]).length){const help=document.createElement('p');help.className='account-link-status';help.textContent='To unlink an account, run /unlink CONFIRM in-game using that account.';link.append(help);}
    if(session.networkAccountsPending){button.disabled=true;link.querySelector('p').textContent='Linking will be available after the server connection is activated.';}
    button.addEventListener('click',()=>{code.hidden=false;actions.startLink(button,command,status);});
    if(session.linkedPunishmentAppeals){
      for(const [index,id,title] of [[2,'account-active-punishments','Active punishments'],[3,'account-expired-punishments','Expired punishments']]){
        const panel=panels[index];panel.id=id;panel.replaceChildren();const heading=document.createElement('h3');heading.textContent=title;panel.append(heading);
      }
    }else{
    const claim=panels[2],liveClaim=actions.punishmentClaimSection(session);claim.replaceChildren(...liveClaim.children);
    for(const label of claim.querySelectorAll('label'))label.className='f';for(const input of claim.querySelectorAll('input,select'))input.className='field';claim.querySelector('button')?.classList.add('btn-gold');
    const bindings=panels[3];bindings.querySelector('[id]')?.removeAttribute('id');bindings.id='account-punishment-bindings';bindings.replaceChildren();
    }
  }
  root.replaceChildren(fragment);
  window.dispatchEvent(new Event('enthusia:account-rendered'));
}
