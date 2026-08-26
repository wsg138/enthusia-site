#!/usr/bin/env python3
import hashlib
import http.cookiejar
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = os.environ.get('WIKI_API', 'https://enthusia.miraheze.org/w/api.php')
USERNAME = os.environ['WIKI_BOT_USERNAME'].strip()
PASSWORD = os.environ['WIKI_BOT_PASSWORD']
OUT = Path(os.environ.get('WIKI_SPEED_OUT', 'wiki-speed-output'))
BACKUP_MANIFEST = OUT / 'full-backup' / 'manifest.json'
CSS_SOURCE = Path('wiki-worker/mobile-native-sidebar.css')
CSS_START = '/* BEGIN ENTHUSIA NATIVE MOBILE SIDEBAR */'
CSS_END = '/* END ENTHUSIA NATIVE MOBILE SIDEBAR */'
UA = 'EnthusiaWikiMobileSpeed/1.0 (owner-authorized interface fix)'
OUT.mkdir(parents=True, exist_ok=True)

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def api(params, method='POST'):
    full = {'format': 'json', 'formatversion': '2', 'maxlag': '5', **params}
    headers = {'User-Agent': UA, 'Accept': 'application/json'}
    if method == 'GET':
        req = urllib.request.Request(API + '?' + urllib.parse.urlencode(full), headers=headers)
    else:
        req = urllib.request.Request(
            API,
            data=urllib.parse.urlencode(full).encode('utf-8'),
            headers={**headers, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'}
        )
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
    who = api({'action': 'query', 'meta': 'userinfo', 'uiprop': 'rights'}, 'GET')['query']['userinfo']
    rights = set(who.get('rights') or [])
    missing = {'editinterface', 'editsitecss'} - rights
    if missing:
        raise RuntimeError('Missing interface rights: ' + ', '.join(sorted(missing)))
    csrf = api({'action': 'query', 'meta': 'tokens', 'type': 'csrf'}, 'GET')['query']['tokens']['csrftoken']
    return who, csrf


def page(title):
    data = api({
        'action': 'query', 'prop': 'revisions|info', 'titles': title,
        'rvprop': 'ids|timestamp|content|contentmodel', 'rvslots': 'main', 'curtimestamp': '1'
    }, 'GET')
    p = data['query']['pages'][0]
    rev = (p.get('revisions') or [{}])[0]
    slot = (rev.get('slots') or {}).get('main') or {}
    return {
        'title': title,
        'revid': rev.get('revid'),
        'timestamp': rev.get('timestamp'),
        'content': slot.get('content', ''),
        'curtimestamp': data.get('curtimestamp')
    }


def backup_map():
    if not BACKUP_MANIFEST.exists():
        raise RuntimeError('Fresh full backup manifest missing')
    manifest = json.loads(BACKUP_MANIFEST.read_text(encoding='utf-8'))
    pages = manifest.get('pages', [])
    return manifest, {p.get('title'): p for p in pages}


def guard(before, bmap):
    rec = bmap.get(before['title'])
    expected = (rec.get('currentRevision') or {}).get('revid') if rec else None
    if expected is None or before.get('revid') != expected:
        raise RuntimeError(f'Race detected for {before["title"]}: backup {expected}, live {before.get("revid")}')


def replace_block(existing, source):
    if CSS_START not in existing or CSS_END not in existing:
        raise RuntimeError('Native mobile sidebar managed block missing from Common.css')
    if existing.count(CSS_START) != 1 or existing.count(CSS_END) != 1:
        raise RuntimeError('Native mobile sidebar managed block is not unique')
    before, rest = existing.split(CSS_START, 1)
    _, after = rest.split(CSS_END, 1)
    block = CSS_START + '\n' + source.strip() + '\n' + CSS_END
    return before.rstrip() + '\n\n' + block + after


def sha256(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def edit(csrf, before, target):
    if before.get('content', '').rstrip() == target.rstrip():
        return {'title': before['title'], 'result': 'already_current', 'revid': before['revid'], 'sha256': sha256(target)}
    result = api({
        'action': 'edit', 'title': before['title'], 'text': target, 'token': csrf,
        'summary': 'Make native mobile sidebar transitions immediate', 'assert': 'user',
        'watchlist': 'nochange', 'starttimestamp': before['curtimestamp'],
        'basetimestamp': before['timestamp'], 'contentmodel': 'css'
    }).get('edit') or {}
    if result.get('result') != 'Success':
        raise RuntimeError(f'Edit failed for {before["title"]}: {result}')
    after = page(before['title'])
    if after.get('content', '').rstrip() != target.rstrip():
        raise RuntimeError(f'Readback mismatch for {before["title"]}')
    return {
        'title': before['title'], 'result': 'published',
        'oldrevid': result.get('oldrevid'), 'newrevid': result.get('newrevid'),
        'sha256': sha256(target)
    }


def purge():
    return api({'action': 'purge', 'titles': 'Main Page|MediaWiki:Common.css', 'forcelinkupdate': '1'})


def backup_revision(bmap, title):
    rec = bmap.get(title) or {}
    return (rec.get('currentRevision') or {}).get('revid')


def main():
    manifest, bmap = backup_map()
    who, csrf = login()
    common_css = page('MediaWiki:Common.css')
    guard(common_css, bmap)

    source = CSS_SOURCE.read_text(encoding='utf-8')
    required = [
        'body.skin-minerva #mw-mf-page-left {',
        'transition: transform .1s ease-out !important;',
        'body.skin-minerva .main-menu-mask {',
        'transition: opacity .08s ease-out !important;'
    ]
    for marker in required:
        if marker not in source:
            raise RuntimeError(f'Mobile speed CSS missing expected marker: {marker}')
    if 'visibility .18s' in source or 'visibility .15s' in source:
        raise RuntimeError('Old visibility transition is still present in source')

    target = replace_block(common_css['content'], source).rstrip() + '\n'
    css_result = edit(csrf, common_css, target)
    purge_one = purge()
    time.sleep(2)
    purge_two = purge()

    evidence = {
        'authenticatedAs': who.get('name'),
        'backupCreatedAtUtc': manifest.get('createdAtUtc'),
        'backupPageCount': len(manifest.get('pages', [])),
        'preservedCommunityRevisions': {
            title: backup_revision(bmap, title)
            for title in ['SonOfBlood', 'Aquariom', 'We On Top (WOT)'] if title in bmap
        },
        'commonCss': css_result,
        'purgeResponses': [purge_one.get('purge'), purge_two.get('purge')],
        'finishedAtUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    }
    (OUT / 'sidebar-speed-evidence.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(evidence, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'MOBILE SIDEBAR SPEED ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
