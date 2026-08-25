#!/usr/bin/env python3
import hashlib
import http.cookiejar
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

API = os.environ.get('WIKI_API', 'https://enthusia.miraheze.org/w/api.php')
USERNAME = os.environ['WIKI_BOT_USERNAME'].strip()
PASSWORD = os.environ['WIKI_BOT_PASSWORD']
OUT = Path(os.environ.get('WIKI_ROLLBACK_OUT', 'wiki-mobile-menu-rollback-output'))
BACKUP_MANIFEST = OUT / 'full-backup' / 'manifest.json'
JS_SOURCE = Path('wiki-worker/mobile-minerva-integration.js')
JS_START = '/* BEGIN ENTHUSIA MINERVA MOBILE */'
JS_END = '/* END ENTHUSIA MINERVA MOBILE */'
UA = 'EnthusiaWikiMobileMenuRollback/1.0 (owner-authorized wiki publisher)'
OUT.mkdir(parents=True, exist_ok=True)

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def api(params, method='POST'):
    full = {'format': 'json', 'formatversion': '2', 'maxlag': '5', **params}
    headers = {'User-Agent': UA, 'Accept': 'application/json'}
    if method == 'GET':
        req = urllib.request.Request(API + '?' + urllib.parse.urlencode(full), headers=headers)
    else:
        data = urllib.parse.urlencode(full).encode()
        req = urllib.request.Request(API, data=data, headers={**headers, 'Content-Type': 'application/x-www-form-urlencoded'})
    with opener.open(req, timeout=90) as response:
        result = json.load(response)
    if result.get('error'):
        raise RuntimeError(result['error'])
    return result

def login():
    token = api({'action': 'query', 'meta': 'tokens', 'type': 'login'}, 'GET')['query']['tokens']['logintoken']
    result = api({'action': 'login', 'lgname': USERNAME, 'lgpassword': PASSWORD, 'lgtoken': token})
    if result.get('login', {}).get('result') != 'Success':
        raise RuntimeError(f'Login failed: {result}')
    who = api({'action': 'query', 'meta': 'userinfo', 'uiprop': 'rights|groups'}, 'GET')['query']['userinfo']
    rights = set(who.get('rights') or [])
    missing = {'editinterface', 'editsitejs'} - rights
    if missing:
        raise RuntimeError('Missing interface rights: ' + ', '.join(sorted(missing)))
    csrf = api({'action': 'query', 'meta': 'tokens', 'type': 'csrf'}, 'GET')['query']['tokens']['csrftoken']
    return who, csrf

def page(title):
    data = api({'action': 'query', 'prop': 'revisions|info', 'titles': title,
                'rvprop': 'ids|timestamp|user|comment|content|contentmodel', 'rvslots': 'main', 'curtimestamp': '1'}, 'GET')
    p = data['query']['pages'][0]
    rev = (p.get('revisions') or [{}])[0]
    slot = (rev.get('slots') or {}).get('main') or {}
    return {'title': title, 'missing': bool(p.get('missing')), 'revid': rev.get('revid'),
            'timestamp': rev.get('timestamp'), 'content': slot.get('content', ''),
            'contentmodel': slot.get('contentmodel') or rev.get('contentmodel'),
            'curtimestamp': data.get('curtimestamp')}

def backup_map():
    manifest = json.loads(BACKUP_MANIFEST.read_text(encoding='utf-8'))
    return manifest, {p.get('title'): p for p in manifest.get('pages', [])}

def guard(before, bmap):
    rec = bmap.get(before['title'])
    expected = (rec.get('currentRevision') or {}).get('revid') if rec else None
    if expected is None:
        if not before.get('missing'):
            raise RuntimeError(f'Race detected: {before["title"]} appeared after backup')
    elif before.get('revid') != expected:
        raise RuntimeError(f'Race detected: {before["title"]} backup rev {expected}, live rev {before.get("revid")}')

def managed(existing, block):
    if JS_START not in existing or JS_END not in existing:
        raise RuntimeError('Minerva managed block markers missing from Common.js')
    payload = f'{JS_START}\n{block.strip()}\n{JS_END}'
    before, rest = existing.split(JS_START, 1)
    _, after = rest.split(JS_END, 1)
    return before.rstrip() + '\n\n' + payload + after

def sha256(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def main():
    manifest, bmap = backup_map()
    who, csrf = login()
    before = page('MediaWiki:Common.js')
    guard(before, bmap)
    source = JS_SOURCE.read_text(encoding='utf-8')
    if 'NATIVE_TOGGLE_SELECTOR' in source or 'bottomMenuButton' in source:
        raise RuntimeError('Regression interception code still present in rollback source')
    target = managed(before.get('content', ''), source).rstrip() + '\n'
    if before.get('content', '').rstrip() == target.rstrip():
        result = {'title': 'MediaWiki:Common.js', 'result': 'already_current', 'revid': before.get('revid'), 'sha256': sha256(target)}
    else:
        params = {'action': 'edit', 'title': 'MediaWiki:Common.js', 'text': target, 'token': csrf,
                  'summary': 'Rollback broken mobile menu interception', 'assert': 'user',
                  'watchlist': 'nochange', 'starttimestamp': before.get('curtimestamp'), 'contentmodel': 'javascript'}
        if before.get('timestamp'):
            params['basetimestamp'] = before['timestamp']
        edit = (api(params).get('edit') or {})
        if edit.get('result') != 'Success':
            raise RuntimeError(f'Edit failed: {edit}')
        after = page('MediaWiki:Common.js')
        if after.get('content', '').rstrip() != target.rstrip():
            raise RuntimeError('Common.js readback mismatch')
        result = {'title': 'MediaWiki:Common.js', 'result': 'published', 'oldrevid': edit.get('oldrevid'),
                  'newrevid': edit.get('newrevid'), 'sha256': sha256(target)}
    evidence = {'authenticatedAs': who.get('name'), 'backupCreatedAtUtc': manifest.get('createdAtUtc'),
                'backupPageCount': len(manifest.get('pages', [])), 'commonJs': result}
    (OUT / 'rollback-evidence.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(evidence, indent=2))

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'MOBILE MENU ROLLBACK ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
