import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleCommunity } from '../functions/lib/community/service.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXQAAAAASUVORK5CYII=','base64');
function fixture(){
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/community/0001_community.sql',import.meta.url),'utf8'));
  const db={prepare(query){let values=[];return {bind(...v){values=v;return this;},async first(){return sql.prepare(query).get(...values)??null;},async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};}};},async batch(statements){const results=[];for(const statement of statements)results.push(await statement.run());return results;}};
  const objects=new Map(),bucket={async put(key,data,options){objects.set(key,{data:Uint8Array.from(data),httpMetadata:options.httpMetadata});},async get(key){const value=objects.get(key);return value?{body:new Response(value.data).body,httpMetadata:value.httpMetadata}:null;}};
  const call=(path,method='GET',body,actor=true,origin='https://site.example')=>handleCommunity({request:new Request('https://site.example/api/community/'+path,{method,headers:{origin},...(body?{body}: {})}),params:{path},env:{COMMUNITY_DB:db,COMPETITIONS_MEDIA:bucket}},{editor:async()=>actor?{id:'staff'}:null,identity:async()=>null});
  return {sql,call,objects};
}
test('news image uploads require same-origin editors and valid PNG or JPEG bytes',async()=>{
  const {sql,call,objects}=fixture();try{
    assert.equal((await call('admin/news-media','POST',png,false)).status,403);
    assert.equal((await call('admin/news-media','POST',png,true,'https://other.example')).status,403);
    assert.equal((await call('admin/news-media','POST',Buffer.from('not an image'))).status,400);
    const response=await call('admin/news-media','POST',png);assert.equal(response.status,201);
    const data=await response.json();assert.match(data.url,/^\/api\/community\/news-media\/[a-f0-9]{32}$/);assert.equal(objects.size,1);
  }finally{sql.close();}
});
test('uploaded images remain private in drafts and become readable when a post is published',async()=>{
  const {sql,call}=fixture();try{
    const first=await(await call('admin/news-media','POST',png)).json(),second=await(await call('admin/news-media','POST',png)).json();
    const post={kind:'news',slug:'image-test',title:'Image test',body:'![Screenshot]('+first.url+')',image:second.url,status:'draft',revision:0};
    let saved=await call('admin/news','POST',JSON.stringify(post));assert.equal(saved.status,200);
    for(const url of [first.url,second.url])assert.equal((await call(url.split('/api/community/')[1],'GET',undefined,false)).status,404);
    saved=await call('admin/news','POST',JSON.stringify({...post,status:'published',revision:1}));assert.equal(saved.status,200);
    for(const url of [first.url,second.url])assert.equal((await call(url.split('/api/community/')[1],'GET',undefined,false)).status,200);
    saved=await call('admin/news','POST',JSON.stringify({...post,status:'published',revision:2,body:'Updated',image:''}));assert.equal(saved.status,200);
    for(const url of [first.url,second.url])assert.equal((await call(url.split('/api/community/')[1],'GET',undefined,false)).status,404);
  }finally{sql.close();}
});
test('draft media is restricted to editors and public access follows publication',async()=>{
  const {sql,call}=fixture();try{
    const uploaded=await (await call('admin/news-media','POST',png)).json(),id=uploaded.url.split('/').pop();
    assert.equal((await call('news-media/'+id,'GET',undefined,false)).status,404);
    assert.equal((await call('news-media/'+id)).status,200);
    const insert=sql.prepare('INSERT INTO community_records(kind,slug,status,payload,revision,editor,updated_at) VALUES(?,?,?,?,?,?,?)');
    insert.run('news','cover','published',JSON.stringify({image:uploaded.url,body:''}),1,'staff',new Date().toISOString());
    let response=await call('news-media/'+id,'GET',undefined,false);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
    sql.prepare("UPDATE community_records SET status='draft' WHERE slug='cover'").run();assert.equal((await call('news-media/'+id,'GET',undefined,false)).status,404);
    sql.prepare("UPDATE community_records SET status='published',payload=? WHERE slug='cover'").run(JSON.stringify({image:'',body:'![Image]('+uploaded.url+')'}));
    response=await call('news-media/'+id,'GET',undefined,false);assert.equal(response.status,200);
  }finally{sql.close();}
});

// Two 1x1 frames with a shared red/blue palette, separate delays and an infinite loop.
const animation=Buffer.from('47494638396101000100800000ff00000000ff21ff0b4e45545343415045322e30030100000021f90400060000002c000000000100010000020244010021f904000c0000002c00000000010001000002024c01003b','hex');
test('animated News GIFs preserve frame data, timing and loop on upload and publication',async()=>{
  const {sql,call}=fixture();
  try {
    for(const bytes of [animation,Buffer.concat([animation.subarray(0,-1),Buffer.from([0x21,0xfe,3,65,66,67,0,0x3b])])]){
      const uploaded=await call('admin/news-media','POST',bytes);
      assert.equal(uploaded.status,201);
      const {url,width,height}=await uploaded.json();
      assert.deepEqual([width,height],[1,1]);
      const path=url.split('/api/community/')[1];
      assert.equal((await call(path,'GET',undefined,false)).status,404);
      const post={kind:'news',slug:url.split('/').pop(),title:'GIF',body:'![Animated]('+url+')',image:url,status:'published'};
      assert.equal((await call('admin/news','POST',JSON.stringify(post))).status,200);
      const response=await call(path,'GET',undefined,false);
      assert.equal(response.headers.get('content-type'),'image/gif');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),animation);
    }
    for(const invalid of [animation.subarray(0,-1),Buffer.concat([animation,Buffer.from('extra')])]){
      assert.equal((await call('admin/news-media','POST',invalid)).status,400);
    }
  } finally {sql.close();}
});
