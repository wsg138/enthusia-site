(()=>{
function addButton(parent,label,before){
  if(!parent||parent.querySelector('[data-page="piecloak"]'))return;
  const b=document.createElement('button');
  b.textContent=label;
  b.dataset.page='piecloak';
  b.onclick=()=>{location.hash='#page/piecloak';document.body.classList.remove('menu-open')};
  if(before)parent.insertBefore(b,before);else parent.appendChild(b);
}
function enhance(){
  const nav=document.querySelector('.sidebar nav');
  if(nav){const mechanics=nav.querySelector('[data-page="mechanics"]');addButton(nav,'PieCloak',mechanics?.nextSibling||null)}
  const gameplayQuick=document.querySelector('.home-two .panel:last-child .quick');
  if(gameplayQuick)addButton(gameplayQuick,'PieCloak',null);
}
new MutationObserver(enhance).observe(document.getElementById('app'),{childList:true,subtree:true});
queueMicrotask(enhance);
})();
