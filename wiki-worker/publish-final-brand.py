#!/usr/bin/env python3
import hashlib, http.cookiejar, json, os, time, urllib.parse, urllib.request, uuid
from pathlib import Path

API=os.environ.get('WIKI_API','https://enthusia.miraheze.org/w/api.php')
USERNAME=os.environ['WIKI_BOT_USERNAME'].strip()
PASSWORD=os.environ['WIKI_BOT_PASSWORD']
ROOT=Path(__file__).resolve().parent.parent
ICON_ROOT=ROOT/'wiki-worker'/'card-icons'
BRAND_SOURCE=ROOT/'wiki-worker'/'player-card-and-brand'/'common-brand.css'
OUT=Path(os.environ.get('WIKI_FINAL_BRAND_OUT','wiki-final-brand-output'))
OUT.mkdir(parents=True,exist_ok=True)
FILES=['Commands.svg','Market.svg','Warzone.svg','HistoryLore.svg']
START='/* BEGIN ENTHUSIA MANAGED BRAND */'
END='/* END ENTHUSIA MANAGED BRAND */'
jar=http.cookiejar.CookieJar()
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def api(params,method='POST'):
    full={'format':'json','formatversion':'2','maxlag':'5',**params}
    headers={'User-Agent':'EnthusiaWikiFinalBrand/1.0','Accept':'application/json'}
    if method=='GET':
        req=urllib.request.Request(API+'?'+urllib.parse.urlencode(full),headers=headers)
    else:
        body=urllib.parse.urlencode(full).encode()
        req=urllib.request.Request(API,data=body,headers={**headers,'Content-Type':'application/x-www-form-urlencoded'})
    with opener.open(req,timeout=90) as r:
        result=json.load(r)
    if 'error' in result:
        raise RuntimeError(result['error'])
    return result

def login():
    token=api({'action':'query','meta':'tokens','type':'login'},'GET')['query']['tokens']['logintoken']
    login_result=api({'action':'login','lgname':USERNAME,'lgpassword':PASSWORD,'lgtoken':token})
    if login_result.get('login',{}).get('result')!='Success':
        raise RuntimeError(f'Login failed: {login_result}')
    who=api({'action':'query','meta':'userinfo','uiprop':'rights|groups'},'GET')['query']['userinfo']
    if who.get('anon'):
        raise RuntimeError('Authentication failed')
    rights=set(who.get('rights') or [])
    required={'editinterface','editsitecss'}
    missing=required-rights
    print(json.dumps({'authenticatedAs':who.get('name'),'groups':who.get('groups'),'hasEditInterface':'editinterface' in rights,'hasEditSiteCss':'editsitecss' in rights},indent=2))
    if missing:
        raise RuntimeError('Missing required interface rights: '+', '.join(sorted(missing)))
    csrf=api({'action':'query','meta':'tokens','type':'csrf'},'GET')['query']['tokens']['csrftoken']
    return who,csrf

def get_page(title):
    data=api({'action':'query','prop':'revisions|info','titles':title,'rvprop':'ids|timestamp|user|comment|content|contentmodel','rvslots':'main','curtimestamp':'1'},'GET')
    page=data['query']['pages'][0]
    rev=(page.get('revisions') or [{}])[0]
    slot=(rev.get('slots') or {}).get('main') or {}
    return {'title':title,'missing':bool(page.get('missing')),'revid':rev.get('revid'),'timestamp':rev.get('timestamp'),'user':rev.get('user'),'comment':rev.get('comment'),'content':slot.get('content',''),'contentmodel':slot.get('contentmodel') or rev.get('contentmodel'),'curtimestamp':data.get('curtimestamp')}

def managed_css(existing,block):
    block=block.strip()
    managed=f'{START}\n{block}\n{END}'
    if START in existing and END in existing:
        before,rest=existing.split(START,1)
        _,after=rest.split(END,1)
        return before.rstrip()+"\n\n"+managed+after
    return existing.rstrip()+("\n\n" if existing.strip() else "")+managed+"\n"

def publish_common_css(csrf):
    title='MediaWiki:Common.css'
    before=get_page(title)
    source=BRAND_SOURCE.read_text(encoding='utf-8')
    target=managed_css(before.get('content',''),source)
    (OUT/'common-css-before.json').write_text(json.dumps(before,indent=2)+'\n',encoding='utf-8')
    if before.get('content','').rstrip()==target.rstrip():
        return {'title':title,'result':'already_current','revid':before.get('revid')}
    params={'action':'edit','title':title,'text':target,'token':csrf,'summary':'Apply approved Enthusia wiki branding and player-card styling','assert':'user','watchlist':'nochange','starttimestamp':before.get('curtimestamp') or time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
    if before.get('timestamp'):
        params['basetimestamp']=before['timestamp']
    result=api(params)
    edit=result.get('edit',{})
    if edit.get('result')!='Success':
        raise RuntimeError(f'Common.css edit failed: {edit}')
    after=get_page(title)
    (OUT/'common-css-after.json').write_text(json.dumps(after,indent=2)+'\n',encoding='utf-8')
    if after.get('content','').rstrip()!=target.rstrip():
        raise RuntimeError('Common.css readback mismatch')
    return {'title':title,'result':'published','oldrevid':edit.get('oldrevid'),'newrevid':edit.get('newrevid')}

def multipart(fields,filename,data,mime):
    boundary='----Enthusia'+uuid.uuid4().hex
    chunks=[]
    for k,v in fields.items():
        chunks += [f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()]
    chunks += [f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n'.encode(),data,b'\r\n',f'--{boundary}--\r\n'.encode()]
    return boundary,b''.join(chunks)

def imageinfo(name):
    q=api({'action':'query','prop':'imageinfo','titles':'File:'+name,'iiprop':'sha1|timestamp|size|mime'},'GET')['query']['pages'][0]
    if q.get('missing') or not q.get('imageinfo'):
        raise RuntimeError(f'File:{name} missing')
    ii=q['imageinfo'][0]
    return {k:ii.get(k) for k in ('sha1','timestamp','width','height','size','mime')}

def publish_icon(name,csrf):
    data=(ICON_ROOT/name).read_bytes()
    local_sha1=hashlib.sha1(data).hexdigest()
    before=imageinfo(name)
    if before.get('sha1')==local_sha1:
        return {'name':name,'result':'already_current','sha1':local_sha1,'before':before,'after':before}
    fields={'action':'upload','format':'json','formatversion':'2','filename':name,'token':csrf,'ignorewarnings':'1','comment':'Match Explore Enthusia icons to original palette'}
    boundary,body=multipart(fields,name,data,'image/svg+xml')
    req=urllib.request.Request(API,data=body,headers={'User-Agent':'EnthusiaWikiFinalBrand/1.0','Content-Type':f'multipart/form-data; boundary={boundary}','Accept':'application/json'})
    with opener.open(req,timeout=90) as r:
        result=json.load(r)
    if 'error' in result:
        raise RuntimeError(result['error'])
    if result.get('upload',{}).get('result')!='Success':
        raise RuntimeError(result)
    after=imageinfo(name)
    if after.get('sha1')!=local_sha1:
        raise RuntimeError(f'File:{name} readback sha1 mismatch')
    return {'name':name,'result':'uploaded','sha1':local_sha1,'before':before,'after':after}

def main():
    who,csrf=login()
    css=publish_common_css(csrf)
    icons=[publish_icon(name,csrf) for name in FILES]
    evidence={'authenticatedAs':who.get('name'),'commonCss':css,'icons':icons}
    (OUT/'evidence.json').write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(evidence,indent=2))

if __name__=='__main__':
    main()
