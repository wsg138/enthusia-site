import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {spawnSync} from 'node:child_process';
import {projectSnapshot} from '../functions/lib/community/contracts.js';
import {connectCompleteProfileCapture,validateProfileImport} from '../scripts/lib/complete-profile-capture.mjs';
const id='10000000-0000-4000-8000-000000000001',date='2020-01-09T12:00:00Z';
const profiles={generatedAt:date,items:[{id,name:'Player',achievementsKnown:true,achievements:['Old'],guildsKnown:true,guildsPartial:true,guildMemberships:[]}],privateToken:'private'};
test('registered slash IDs and longer achievement titles work without broadening other IDs',()=>{
  const title='A registered achievement title longer than forty letters';
  assert.equal(projectSnapshot('players',{items:[{id,name:'Player',achievements:[title]}]}).items[0].achievements[0],title);
  assert.equal(projectSnapshot('achievements',{items:[{id:'provider:guilds/level_40',name:'Title'}]}).items[0].id,'provider:guilds/level_40');
  assert.throws(()=>projectSnapshot('bounties',{items:[{id:'provider:guilds/level_40',name:'Title'}]}));
  assert.throws(()=>projectSnapshot('achievements',{items:[{id:'provider:../private',name:'Title'}]}));
});
test('unknown shared-team captures clear old completion claims and late errors do not mutate inputs',()=>{
  const bundle={players:{generatedAt:date,scope:'registered_renderer_projection',requestedPlayerIds:[id],items:[]}};
  const data=connectCompleteProfileCapture(profiles,bundle);
  assert.equal(data.players.items[0].achievementsKnown,undefined);assert.deepEqual(data.players.items[0].achievements,[]);
  assert.equal(JSON.stringify(data).includes('private'),false);assert.equal(profiles.items[0].achievements[0],'Old');
  assert.equal(data.players.stale,true);assert.equal(Date.parse(data.players.updatedAt),Date.parse(date));
  assert.throws(()=>connectCompleteProfileCapture(profiles,{playerGuilds:{generatedAt:date,items:[{id,guildMemberships:[]}]},bounties:{items:'bad'}}));
  assert.equal(profiles.items[0].guildsPartial,true);
});
test('CLI replacement is atomic on a rejected bundle',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'enthusia-import-test-'));
  try{
    const input=join(directory,'profiles.json'),bundle=join(directory,'bundle.json'),out=join(directory,'output.json');
    await writeFile(input,JSON.stringify(profiles));await writeFile(bundle,JSON.stringify({bounties:{items:'bad'}}));await writeFile(out,'previous output');
    const failed=spawnSync(process.execPath,['scripts/import-profile-capture.mjs',input,bundle,out],{encoding:'utf8'});
    assert.notEqual(failed.status,0);assert.equal(await readFile(out,'utf8'),'previous output');
    await writeFile(bundle,JSON.stringify({playerGuilds:{generatedAt:date,items:[{id,guildMemberships:[]}]}}));
    const success=spawnSync(process.execPath,['scripts/import-profile-capture.mjs',input,bundle,out],{encoding:'utf8'});
    assert.equal(success.status,0,success.stderr);assert.equal(JSON.parse(await readFile(out,'utf8')).players.items[0].guildsPartial,undefined);
  }finally{assert.equal(dirname(directory),tmpdir());assert.ok(basename(directory).startsWith('enthusia-import-test-'));await rm(directory,{recursive:true,force:true});}
});
test('validated preview envelopes remain public and reject unsupported feeds',()=>{
  const result=validateProfileImport({kind:'local_profile_import',players:profiles,feeds:{},privateToken:'private'});
  assert.equal(JSON.stringify(result).includes('private'),false);
  assert.throws(()=>validateProfileImport({kind:'local_profile_import',players:profiles,feeds:{secret:{}}}));
});
