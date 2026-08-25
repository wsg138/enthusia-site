#!/usr/bin/env python3
import argparse, hashlib, http.cookiejar, json, os, sys, time, urllib.error, urllib.parse, urllib.request, uuid
from pathlib import Path

API = os.environ.get('WIKI_API', 'https://enthusia.miraheze.org/w/api.php')
USERNAME = os.environ.get('WIKI_BOT_USERNAME', '').strip()
PASSWORD = os.environ.get('WIKI_BOT_PASSWORD', '')
OUT = Path(os.environ.get('WIKI_MINECRAFT_OUT', 'wiki-minecraft-output'))
BACKUP_MANIFEST = OUT / 'full-backup' / 'manifest.json'
ICON_MAP = Path('wiki-worker/minecraft-card-icons.json')
UA = 'EnthusiaWikiMinecraftIcons/1.1 (owner-authorized wiki publisher)'
RETIRED_CSS = '/* Private staging retired. The approved theme is now site-wide in MediaWiki:Common.css. */\n'
RETIRED_JS = '// Private staging retired. The approved behavior is now site-wide in MediaWiki:Common.js.\n'

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def request(params, method='POST', retries=6):
    full = {'format':'json','formatversion':'2','maxlag':'5', **params}
    headers = {'User-Agent':UA, 'Accept':'application/json'}
    if method == 'GET':
        url = API + '?' + urllib.parse.urlencode(full); data = None
    else:
        url = API; data = urllib.parse.urlencode(full).encode(); headers['Content-Type']='application/x-www-form-urlencoded;charset=UTF-8'
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with opener.open(req, timeout=60) as r: result = json.loads(r.read().decode())
        except urllib.error.HTTPError as exc:
            if exc.code in (429,500,502,503,504) and attempt + 1 < retries:
                time.sleep(min(10 + attempt * 10, 50)); continue
            raise
        if result.get('error'):
            code = result['error'].get('code')
            if code in ('ratelimited','maxlag') and attempt + 1 < retries:
                time.sleep(20 if code == 'ratelimited' else 5 + attempt * 5); continue
            raise RuntimeError(f'MediaWiki API error: {result["error"]}')
        return result
    raise RuntimeError('MediaWiki API retries exhausted')


def download_icons():
    cfg = json.loads(ICON_MAP.read_text())
    base = cfg.get('sourceBase', '')
    dest = OUT / 'icons'; dest.mkdir(parents=True, exist_ok=True)
    rows = []
    for item in cfg['icons']:
        url = item.get('sourceUrl') or (base + urllib.parse.quote(item['sourceFile']))
        req = urllib.request.Request(url, headers={'User-Agent':UA, 'Accept':'image/png,image/*;q=0.9,*/*;q=0.1'})
        with urllib.request.urlopen(req, timeout=45) as r:
            data = r.read()
            final_url = r.geturl()
        if not data.startswith(b'\x89PNG\r\n\x1a\n'):
            raise RuntimeError(f'Not a PNG: {url}')
        if len(data) < 80:
            raise RuntimeError(f'Implausibly small icon: {url} ({len(data)} bytes)')
        path = dest / item['wikiFile']; path.write_bytes(data)
        rows.append({**item, 'sourceUrl':url, 'resolvedUrl':final_url, 'bytes':len(data), 'sha1':hashlib.sha1(data).hexdigest(), 'sha256':hashlib.sha256(data).hexdigest()})
        print(f"ICON OK {item['label']}: {url} ({len(data)} bytes)")
    (OUT / 'icon-source-report.json').write_text(json.dumps(rows, indent=2) + '\n')
    return rows


def login():
    if not USERNAME or not PASSWORD: raise RuntimeError('Missing wiki credentials')
    token = request({'action':'query','meta':'tokens','type':'login'}, 'GET')['query']['tokens']['logintoken']
    res = request({'action':'login','lgname':USERNAME,'lgpassword':PASSWORD,'lgtoken':token})
    if res.get('login',{}).get('result') != 'Success': raise RuntimeError(f'Wiki login failed: {res.get("login")}')
    csrf = request({'action':'query','meta':'tokens'}, 'GET')['query']['tokens']['csrftoken']
    who = request({'action':'query','meta':'userinfo','uiprop':'rights'}, 'GET')['query']['userinfo']
    if who.get('anon'): raise RuntimeError('Anonymous after login')
    return csrf, who


def page(title):
    d = request({'action':'query','prop':'revisions','titles':title,'rvprop':'ids|timestamp|content','rvslots':'main','curtimestamp':'1'}, 'GET')
    p = d['query']['pages'][0]; rev = (p.get('revisions') or [{}])[0]; slot = (rev.get('slots') or {}).get('main') or {}
    return {'missing':bool(p.get('missing')), 'revid':rev.get('revid'), 'timestamp':rev.get('timestamp'), 'content':slot.get('content',''), 'curtimestamp':d.get('curtimestamp')}


def image_info(filename):
    d = request({'action':'query','prop':'imageinfo|revisions','titles':'File:'+filename,'iiprop':'sha1|timestamp|url','rvprop':'ids|timestamp'}, 'GET')
    p = d['query']['pages'][0]; ii = (p.get('imageinfo') or [{}])[0]; rev = (p.get('revisions') or [{}])[0]
    return {'missing':bool(p.get('missing')), 'revid':rev.get('revid'), 'sha1':ii.get('sha1'), 'url':ii.get('url')}


def multipart(fields, file_field, filename, data, content_type='image/png'):
    boundary = '----Enthusia' + uuid.uuid4().hex
    body = bytearray()
    for k,v in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    body += f'--{boundary}\r\nContent-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\nContent-Type: {content_type}\r\n\r\n'.encode()
    body += data + f'\r\n--{boundary}--\r\n'.encode()
    return bytes(body), boundary


def upload(csrf, filename, data):
    fields = {'action':'upload','format':'json','formatversion':'2','filename':filename,'token':csrf,'comment':'Use Minecraft item art for Explore Enthusia navigation','ignorewarnings':'1','assert':'user'}
    body, boundary = multipart(fields, 'file', filename, data)
    req = urllib.request.Request(API, data=body, headers={'User-Agent':UA,'Accept':'application/json','Content-Type':f'multipart/form-data; boundary={boundary}'}, method='POST')
    with opener.open(req, timeout=90) as r: result = json.loads(r.read().decode())
    if result.get('error'): raise RuntimeError(f'Upload API error for {filename}: {result["error"]}')
    if result.get('upload',{}).get('result') != 'Success': raise RuntimeError(f'Upload failed for {filename}: {result.get("upload")}')
    return result['upload']


def edit_user_page(csrf, title, target, expected_revid):
    before = page(title)
    if before['content'].rstrip() == target.rstrip():
        return {'title':title,'result':'already_current','revid':before['revid']}
    if before['revid'] != expected_revid:
        raise RuntimeError(f'Race/user edit detected for {title}: backup rev {expected_revid}, live rev {before["revid"]}')
    params = {'action':'edit','title':title,'text':target,'token':csrf,'summary':'Retire private staging after global theme rollout','assert':'user','watchlist':'nochange','starttimestamp':before['curtimestamp']}
    if before['timestamp']: params['basetimestamp'] = before['timestamp']
    e = request(params).get('edit',{})
    if e.get('result') != 'Success': raise RuntimeError(f'Edit failed for {title}: {e}')
    after = page(title)
    if after['content'].rstrip() != target.rstrip(): raise RuntimeError(f'Readback failed for {title}')
    return {'title':title,'result':'published','oldrevid':e.get('oldrevid'),'newrevid':e.get('newrevid')}


def expected_revisions():
    backup = json.loads(BACKUP_MANIFEST.read_text())
    return {p['title']:(p.get('currentRevision') or {}).get('revid') for p in backup.get('pages',[])}, backup


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--validate-only', action='store_true'); args = ap.parse_args()
    icons = download_icons()
    if args.validate_only:
        print(f'Validated {len(icons)} Minecraft icons.'); return
    if not BACKUP_MANIFEST.exists(): raise RuntimeError('Fresh full backup manifest missing')
    expected, backup = expected_revisions()
    csrf, who = login()
    report = {'wikiUser':who.get('name'),'backupCreatedAtUtc':backup.get('createdAtUtc'),'icons':[],'userPages':[]}

    for title in ('User:P2wn/common.css','User:P2wn/common.js'):
        live = page(title); exp = expected.get(title)
        target = RETIRED_CSS if title.endswith('.css') else RETIRED_JS
        if live['content'].rstrip() != target.rstrip() and live['revid'] != exp:
            raise RuntimeError(f'Race/user edit detected for {title}: backup rev {exp}, live rev {live["revid"]}')

    for row in icons:
        data = (OUT/'icons'/row['wikiFile']).read_bytes(); live = image_info(row['wikiFile'])
        if live.get('sha1') == row['sha1']:
            result = {'file':row['wikiFile'],'result':'already_current','sha1':row['sha1'],'revid':live.get('revid')}
        else:
            up = upload(csrf, row['wikiFile'], data); after = image_info(row['wikiFile'])
            if after.get('sha1') != row['sha1']: raise RuntimeError(f'Image SHA1 readback failed for {row["wikiFile"]}')
            result = {'file':row['wikiFile'],'result':'published','sha1':row['sha1'],'revid':after.get('revid'),'imageinfo':up.get('imageinfo',{})}
        report['icons'].append(result); print(result); time.sleep(1)

    report['userPages'].append(edit_user_page(csrf,'User:P2wn/common.css',RETIRED_CSS,expected.get('User:P2wn/common.css')))
    time.sleep(2)
    report['userPages'].append(edit_user_page(csrf,'User:P2wn/common.js',RETIRED_JS,expected.get('User:P2wn/common.js')))
    (OUT/'minecraft-icon-publish-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))

if __name__ == '__main__':
    try: main()
    except Exception as exc:
        print(f'MINECRAFT ICON PUBLISH ERROR: {exc}', file=sys.stderr); sys.exit(1)
