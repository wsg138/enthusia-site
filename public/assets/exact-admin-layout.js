const primary=new Set(['basics','schedule','entries','voting','judging','moderation','readiness']);
const editor=document.querySelector('#competitionEditor'),nav=editor?.querySelector('.editor-section-nav');
if(editor&&nav){
  const extras=document.createElement('div');extras.className='exact-admin-extras';extras.hidden=true;
  const heading=document.createElement('h3');heading.textContent='Additional staff tools';
  const actions=document.createElement('nav');actions.className='editor-section-nav';actions.setAttribute('aria-label','Additional competition tools');
  extras.append(heading,actions);nav.after(extras);
  const arrange=()=>{
    for(const button of [...nav.querySelectorAll('[data-editor-section]')])if(!primary.has(button.dataset.editorSection))actions.append(button);
    for(const field of editor.querySelectorAll('[data-appearance-media-purpose]'))if(field.parentElement!==extras)extras.append(field);
  }
  const observer=new MutationObserver(arrange);observer.observe(editor,{childList:true,subtree:true});arrange();
  document.addEventListener('click',event=>{const button=event.target.closest?.('[data-editor-section]');if(button)extras.hidden=primary.has(button.dataset.editorSection)&&button.dataset.editorSection!=='readiness';});
}
