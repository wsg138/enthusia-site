#!/usr/bin/env python3
import hashlib, http.cookiejar, json, mimetypes, os, time, urllib.parse, urllib.request, uuid
from pathlib import Path

API=os.environ.get('WIKI_API','https://enthusia.miraheze.org/w/api.php')
USERNAME=os.environ['WIKI_BOT_USERNAME'].strip(); PASSWORD=os.environ['WIKI_BOT_PASSWORD']
ROOT=Path(__file__).resolve().parent
OUT=Path(os.environ.get('WIKI_ICON_OUT','wiki-card-icon-output')); OUT.mkdir(parents=True,exist_ok=True)
FILES=['Commands.svg','Market.svg','Warzone.svg','HistoryLore.svg']
CSS_START='/* Enthusia player-card visited-link fix START */'
CSS_END='/* Enthusia player-card visited-link fix END */'
CSS_BLOCK='''/* Enthusia player-card visited-link fix START */
.enthusia-player-dpl-name a,
.enthusia-player-dpl-name a:visited {
  color: #a9d884 !important;
  font-weight: 600;
}
/* Enthusia player-card visited-link fix END */'''
COMMENT='Polish wiki card icons and player-name link styling'
jar=http.cookiejar.CookieJar(); opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def api(params,method='POST'):
    full={'format':'json','formatversion':'2','maxlag':'5',**params}; headers={'User-Agent':'EnthusiaWikiIconPublisher/1.0','Accept':'application/json'}
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

def page(title):
    q=api({'action':'query','prop':'revisions','titles':title,'rvprop':'ids|timestamp|content','rvslots':'main'},'GET')['query']['pages'][0]
    if q.get('missing'): return {'missing':True,'revid':0,'timestamp':None,'text':''}
    rev=q['revisions'][0]; return {'missing':False,'revid':rev['revid'],'timestamp':rev['timestamp'],'text':rev['slots']['main']['content']}

def file_exists(title):
    q=api({'action':'query','prop':'imageinfo','titles':'File:'+title,'iiprop':'sha1|timestamp'},'GET')['query']['pages'][0]
    return not q.get('missing') and bool(q.get('imageinfo'))

def upload(name,csrf):
    if file_exists(name): raise RuntimeError(f'Refusing to overwrite existing File:{name}')
    data=(ROOT/name).read_bytes(); fields={'action':'upload','format':'json','formatversion':'2','filename':name,'token':csrf,'ignorewarnings':'1','comment':COMMENT}
    boundary,body=multipart(fields,name,data,'image/svg+xml')
    req=urllib.request.Request(API,data=body,headers={'User-Agent':'EnthusiaWikiIconPublisher/1.0','Content-Type':f'multipart/form-data; boundary={boundary}','Accept':'application/json'})
    with opener.open(req,timeout=90) as r: result=json.load(r)
    if 'error' in result: raise RuntimeError(result['error'])
    if result.get('upload',{}).get('result')!='Success': raise RuntimeError(result)
    return {'name':name,'sha256':hashlib.sha256(data).hexdigest(),'result':'uploaded'}

def desired_css(current):
    text=current.rstrip()
    if CSS_START in text:
        a=text.index(CSS_START); b=text.index(CSS_END,a)+len(CSS_END); return (text[:a]+CSS_BLOCK+text[b:]).rstrip()+'\n'
    return (text+'\n\n'+CSS_BLOCK+'\n').lstrip('\n')

def edit_css(title,desired,before,csrf):
    if before['text']==desired: return {'beforeRevid':before['revid'],'afterRevid':before['revid'],'result':'already-current'}
    p={'action':'edit','title':title,'text':desired,'summary':COMMENT,'token':csrf,'bot':'1','nocreate':'1'}
    if before['timestamp']: p['basetimestamp']=before['timestamp']
    r=api(p)['edit']; return {'beforeRevid':before['revid'],'afterRevid':r['newrevid'],'result':'published'}

def main():
    who,csrf=login(); css_title=f"User:{who['name']}/common.css"; before=page(css_title)
    if before['missing']: raise RuntimeError(f'{css_title} unexpectedly missing')
    uploads=[]
    for name in FILES: uploads.append(upload(name,csrf)); time.sleep(0.4)
    css=edit_css(css_title,desired_css(before['text']),before,csrf)
    evidence={'authenticatedAs':who['name'],'uploads':uploads,'privateCssTarget':css_title,'privateCss':css}
    (OUT/'evidence.json').write_text(json.dumps(evidence,indent=2)+'\n'); print(json.dumps(evidence,indent=2))

if __name__=='__main__': main()
