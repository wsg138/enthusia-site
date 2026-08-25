#!/usr/bin/env python3
import hashlib, http.cookiejar, json, os, urllib.parse, urllib.request, uuid
from pathlib import Path

API=os.environ.get('WIKI_API','https://enthusia.miraheze.org/w/api.php')
USERNAME=os.environ['WIKI_BOT_USERNAME'].strip(); PASSWORD=os.environ['WIKI_BOT_PASSWORD']
ROOT=Path(__file__).resolve().parent
OUT=Path(os.environ.get('WIKI_ICON_OUT','wiki-card-icon-refresh-output')); OUT.mkdir(parents=True,exist_ok=True)
FILES=['Commands.svg','Market.svg','Warzone.svg','HistoryLore.svg']
COMMENT='Normalize Explore Enthusia card icon sizing and styling'
jar=http.cookiejar.CookieJar(); opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def api(params,method='POST'):
    full={'format':'json','formatversion':'2','maxlag':'5',**params}; headers={'User-Agent':'EnthusiaWikiIconRefresh/1.0','Accept':'application/json'}
    if method=='GET': req=urllib.request.Request(API+'?'+urllib.parse.urlencode(full),headers=headers)
    else:
        body=urllib.parse.urlencode(full).encode(); req=urllib.request.Request(API,data=body,headers={**headers,'Content-Type':'application/x-www-form-urlencoded'})
    with opener.open(req,timeout=60) as r: result=json.load(r)
    if 'error' in result: raise RuntimeError(result['error'])
    return result

def multipart(fields,filename,data,mime):
    boundary='----Enthusia'+uuid.uuid4().hex; chunks=[]
    for k,v in fields.items(): chunks += [f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()]
    chunks += [f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n'.encode(),data,b'\r\n',f'--{boundary}--\r\n'.encode()]
    return boundary,b''.join(chunks)

def login():
    token=api({'action':'query','meta':'tokens','type':'login'},'GET')['query']['tokens']['logintoken']
    api({'action':'login','lgname':USERNAME,'lgpassword':PASSWORD,'lgtoken':token})
    who=api({'action':'query','meta':'userinfo','uiprop':'rights'},'GET')['query']['userinfo']
    if who.get('anon'): raise RuntimeError('Authentication failed')
    csrf=api({'action':'query','meta':'tokens','type':'csrf'},'GET')['query']['tokens']['csrftoken']
    return who,csrf

def imageinfo(name):
    q=api({'action':'query','prop':'imageinfo','titles':'File:'+name,'iiprop':'sha1|timestamp|size|mime'},'GET')['query']['pages'][0]
    if q.get('missing') or not q.get('imageinfo'): raise RuntimeError(f'File:{name} missing after upload')
    ii=q['imageinfo'][0]
    return {k:ii.get(k) for k in ('sha1','timestamp','width','height','size','mime')}

def upload(name,csrf):
    data=(ROOT/name).read_bytes(); before=imageinfo(name)
    fields={'action':'upload','format':'json','formatversion':'2','filename':name,'token':csrf,'ignorewarnings':'1','comment':COMMENT}
    boundary,body=multipart(fields,name,data,'image/svg+xml')
    req=urllib.request.Request(API,data=body,headers={'User-Agent':'EnthusiaWikiIconRefresh/1.0','Content-Type':f'multipart/form-data; boundary={boundary}','Accept':'application/json'})
    with opener.open(req,timeout=90) as r: result=json.load(r)
    if 'error' in result: raise RuntimeError(result['error'])
    if result.get('upload',{}).get('result')!='Success': raise RuntimeError(result)
    after=imageinfo(name)
    return {'name':name,'sha256':hashlib.sha256(data).hexdigest(),'before':before,'after':after,'result':'uploaded'}

def main():
    who,csrf=login(); uploads=[upload(name,csrf) for name in FILES]
    evidence={'authenticatedAs':who['name'],'uploads':uploads}
    (OUT/'evidence.json').write_text(json.dumps(evidence,indent=2)+'\n'); print(json.dumps(evidence,indent=2))

if __name__=='__main__': main()
