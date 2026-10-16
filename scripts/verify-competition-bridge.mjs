import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,basename,join,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {signedCompetitionBridgeRequest} from '../functions/lib/competitions/bridge.js';

// No input credentials and no network calls: exercise the real website signer
// against the native authenticator, not a second JS implementation of it.
const jar=resolve(process.argv[2]??'minecraft/competition-bridge/target/competition-bridge-1.0.0-SNAPSHOT.jar');
await access(jar);
const directory=await mkdtemp(join(tmpdir(),'enthusia-competition-contract-'));
const originalFetch=globalThis.fetch,requests=[];
try {
  globalThis.fetch=async(url,options)=>{
    assert.equal(new URL(url).origin,'https://competition-contract.invalid');
    requests.push({path:new URL(url).pathname,method:options.method,
      body:new TextDecoder().decode(options.body),headers:options.headers});
    return new Response('{}',{status:200});
  };
  const env={COMPETITION_BRIDGE_ORIGIN:'https://competition-contract.invalid',
    COMPETITION_BRIDGE_BEARER_TOKEN:'b'.repeat(48),COMPETITION_BRIDGE_HMAC_SECRET:'h'.repeat(48)};
  const id='10000000-0000-4000-8000-000000000001';
  await signedCompetitionBridgeRequest(env,'/v1/competitions/player-context',{accountSubject:'synthetic:builder',playerUuid:id});
  await signedCompetitionBridgeRequest(env,'/v1/competitions/guild-members',{guildId:id});
  await signedCompetitionBridgeRequest(env,'/v1/competitions/notifications/submission',{title:'Synthetic garden 🌻',submissionId:id});
  const fixture=join(directory,'requests.json');
  await writeFile(fixture,JSON.stringify(requests));
  const source=fileURLToPath(new URL('./competition-contract/network/enthusia/competitions/bridge/VerifyCompetitionBridge.java',import.meta.url));
  const executable=name=>process.env.JAVA_HOME?join(process.env.JAVA_HOME,'bin',process.platform==='win32'?name+'.exe':name):name;
  const compiled=spawnSync(executable('javac'),['--class-path',jar,'-d',directory,source],{encoding:'utf8',timeout:30000});
  assert.equal(compiled.status,0,compiled.stderr||'Contract compilation failed');
  const result=spawnSync(executable('java'),['--class-path',jar+delimiter+directory,
    'network.enthusia.competitions.bridge.VerifyCompetitionBridge',fixture,directory],{encoding:'utf8',timeout:30000});
  assert.equal(result.error,undefined,result.error?.message);
  assert.equal(result.status,0,result.stderr||'Native bridge contract failed');
  process.stdout.write(result.stdout);
} finally {
  globalThis.fetch=originalFetch;
  const target=resolve(directory);
  assert.equal(dirname(target),resolve(tmpdir()));
  assert.ok(basename(target).startsWith('enthusia-competition-contract-'));
  await rm(target,{recursive:true,force:true});
}
