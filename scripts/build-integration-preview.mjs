import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
async function pages(dir, rel='') {
  const out=[];
  for(const e of await readdir(dir,{withFileTypes:true})) {
    const p=path.posix.join(rel,e.name);
    if(e.isDirectory()&&!['assets','preview','wiki-demo'].includes(e.name))out.push(...await pages(path.join(dir,e.name),p));
    else if(e.isFile()&&e.name.endsWith('.html')&&e.name!=='celestial-test.html')out.push(p);
  }
  return out;
}
for(const p of await pages('public')) {
  let html=await readFile(path.join('public',p),'utf8');
  const previewDir=path.posix.dirname('preview/'+p);
  html=html.replace(/(href|src)="([^"#]+)"/g,(tag,attr,value)=>{
    if(/^(https?:|data:|mailto:|tel:|\/\/)/.test(value))return tag;
    const [pathname]=value.split(/[?#]/,1);
    const target=path.posix.normalize(path.posix.join(path.posix.dirname(p),pathname));
    if(target.startsWith('assets/')||['manifest.webmanifest'].includes(target))return attr+'="'+path.posix.relative(previewDir,target)+value.slice(pathname.length)+'"';
    return tag;
  });
  html=html.replace(/url\((['"]?)([^)'"\s]+)\1\)/g,(tag,quote,value)=>{
    if(/^(https?:|data:|\/\/)/.test(value))return tag;
    const target=path.posix.normalize(path.posix.join(path.posix.dirname(p),value));
    if(target.startsWith('assets/'))return 'url('+quote+path.posix.relative(previewDir,target)+quote+')';
    return tag;
  });
  const prefix=path.posix.relative(path.posix.dirname(p),'.');const root=prefix?prefix+'/':'./';
  html=html.replace('<html ', '<html data-preview-root="'+root+'" ');
  html=html.replace('</head>','<meta name="robots" content="noindex,nofollow,noarchive">\n</head>');
  html=html.replace("<head>","<head>\n<script src=\""+root+"fixtures.js\"></script>");
  const target=path.join('public/preview',p);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,html);
}
console.log('Generated combined preview pages from actual site HTML.');
