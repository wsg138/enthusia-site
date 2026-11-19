import test from 'node:test';
import assert from 'node:assert/strict';
import { checkout } from '../functions/api/store/checkout.js';

const origin = 'https://enthusia.info';
const env = { TEBEX_AVID_PACKAGE_ID:'12', TEBEX_DEVOTEE_PACKAGE_ID:'34', TEBEX_PLUGIN_SECRET:'fixture' };
function submit(body, send, config = env) {
  const request = new Request(origin+'/api/store/checkout', {method:'POST', headers:{origin,'content-type':'application/json'}, body:JSON.stringify(body)});
  return checkout({request, env:config}, send);
}
for (const [rank,id] of [['avid','12'],['devotee','34']]) {
  test('forwards the confirmed username and '+rank+' package',async()=>{
    const reply=await submit({rank,username:'.Test_Player'}, async(url,options)=>{
      assert.equal(url,'https://plugin.tebex.io/checkout');
      assert.equal(options.headers['X-Tebex-Secret'],'fixture');
      assert.deepEqual(JSON.parse(options.body),{package_id:id,username:'.Test_Player'});
      return Response.json({url:'https://enthusia-shop.tebex.io/buy/example'},{status:201});
    });
    assert.deepEqual(await reply.json(),{url:'https://enthusia-shop.tebex.io/buy/example'});
  });
}
test('invalid selections and missing configuration never reach Tebex',async()=>{
  const noFetch=()=>assert.fail('unexpected provider request');
  assert.equal((await submit({rank:'other',username:'Test'},noFetch)).status,400);
  assert.equal((await submit({rank:'avid',username:''},noFetch)).status,400);
  assert.equal((await submit({rank:'avid',username:'Test'},noFetch,{})).status,503);
});
test('provider failures never redirect the player',async()=>{
  for(const response of [Response.json({}, {status:429}),Response.json({url:'https://example.org/buy/test'})]){
    const reply=await submit({rank:'avid',username:'Test'},async()=>response);
    assert.equal(reply.ok,false);
    assert.equal((await reply.json()).url,undefined);
  }
});
