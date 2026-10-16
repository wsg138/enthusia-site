// Local output only. All validation finishes before the atomic replacement.
import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {projectSnapshot} from '../functions/lib/community/contracts.js';
import {connectCompleteProfileCapture,validateProfileImport} from './lib/complete-profile-capture.mjs';
const [profilesFile,bundleFile,outputFile]=process.argv.slice(2);
if(!profilesFile||!bundleFile||!outputFile)throw new Error('Usage: node scripts/import-profile-capture.mjs profiles.json bundle.json local-output.json');
const output=resolve(outputFile);
if([profilesFile,bundleFile].some(file=>resolve(file)===output))throw new Error('Output must not overwrite inputs');
async function json(file){const raw=await readFile(file,'utf8');if(Buffer.byteLength(raw)>2000000)throw new Error('Capture exceeds 2 MB');return JSON.parse(raw.replace(/^\uFEFF/,''));}
const input=await json(profilesFile),bundle=await json(bundleFile);
const profiles={...projectSnapshot('players',input),stale:input.stale===true};
const result=validateProfileImport({kind:'local_profile_import',...connectCompleteProfileCapture(profiles,bundle)});
const temp=join(dirname(output),'.profile-import-'+randomUUID()+'.tmp');
try{await writeFile(temp,JSON.stringify(result,null,2)+'\n',{flag:'wx'});await rename(temp,output);}
catch(error){await unlink(temp).catch(()=>{});throw error;}
console.log('Validated local import: '+result.players.items.length+' profiles; feeds '+Object.keys(result.feeds).join(', '));
