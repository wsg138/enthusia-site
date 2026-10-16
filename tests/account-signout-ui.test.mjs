import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

// Exercise the actual account actions in an isolated DOM test double. No browser,
// network service, cookie or real session is involved.
function node() {
  return {children:[],events:{},dataset:{},className:'btn btn-dark',disabled:false,
    append(...items){for(const item of items){item.parentElement=this;this.children.push(item);}},
    addEventListener(name,action){this.events[name]=action;},setAttribute(){},focus(){this.focused=true;},
    remove(){this.parentElement.children=this.parentElement.children.filter(child=>child!==this);},
    querySelector(selector){
      for(const child of this.children){
        if(selector==='#'+child.id||selector==='[data-signout-cancel]'&&child.dataset.signoutCancel)return child;
        const found=child.querySelector(selector);if(found)return found;
      }return null;
    }};
}
async function fixture(status=200) {
  const root=node(),controls=node(),button=node(),calls=[];let reloads=0;
  root.append(controls);controls.append(button);
  const source=(await readFile(new URL('../public/assets/account.js',import.meta.url),'utf8'))
    .replace(/^import[^\n]+\n/,'').replace(/^render\(\)\.catch\(showAccountLoadError\);$/m,'');
  const context={document:{querySelector:()=>root,createElement:node},
    window:{location:{reload(){reloads++;}}},
    fetch:async(path,options)=>{calls.push({path,options});return Response.json({error:'session_revocation_unavailable'},{status});}};
  vm.createContext(context);vm.runInContext(source,context);
  return {root,controls,button,calls,context,reloads:()=>reloads};
}
function confirmation(context){return context.root.querySelector('#account-signout-confirm');}
test('all-device sign-out requires confirmation and cancel sends no request',async()=>{
  const f=await fixture();f.context.signOut(f.button,true);
  assert.equal(f.calls.length,0);assert.ok(confirmation(f));
  f.context.signOut(f.button,true);assert.equal(f.controls.children.length,2);
  confirmation(f).children[2].events.click();
  assert.equal(confirmation(f),null);assert.equal(f.calls.length,0);assert.equal(f.button.focused,true);
});
test('confirmed sign-out uses the all-device route and reloads only after success',async()=>{
  const f=await fixture();f.context.signOut(f.button,true);
  confirmation(f).children[1].events.click();await new Promise(setImmediate);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].path,'/api/competitions/auth/logout-all');
  assert.equal(f.calls[0].options.method,'POST');assert.equal(f.calls[0].options.credentials,'same-origin');
  assert.equal(f.reloads(),1);
});
test('failed revocation retains the account and lets the player retry or cancel',async()=>{
  const f=await fixture(503);f.context.signOut(f.button,true);
  const panel=confirmation(f);panel.children[1].events.click();await new Promise(setImmediate);
  assert.equal(f.reloads(),0);assert.equal(panel.children[1].disabled,false);assert.equal(panel.children[2].disabled,false);
  assert.equal(f.root.querySelector('#account-signout-status').textContent,'Sign out failed. Try again.');
  panel.children[2].events.click();assert.equal(confirmation(f),null);
});
