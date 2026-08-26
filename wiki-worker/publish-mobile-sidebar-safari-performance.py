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
OUT = Path(os.environ.get('WIKI_SAFARI_OUT', 'wiki-safari-output'))
BACKUP_MANIFEST = OUT / 'full-backup' / 'manifest.json'
CSS_SOURCE = Path('wiki-worker/mobile-native-sidebar.css')
CSS_START = '/* BEGIN ENTHUSIA NATIVE MOBILE SIDEBAR */'
CSS_END = '/* END ENTHUSIA NATIVE MOBILE SIDEBAR */'
UA = 'EnthusiaWikiMobileSafariPerformance/1.0 (owner-authorized interface fix)'
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


def replace_block(existing, start, end, source):
    if start not in existing or end not in existing:
        raise RuntimeError('Native mobile sidebar managed block missing from live Common.css')
    before, rest = existing.split(start, 1)
    _, after = rest.split(end, 1)
    block = start + '\n' + source.strip() + '\n' + end
    return before.rstrip() + '\n\n' + block + after


def sha256(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def edit(csrf, before, target):
    if before.get('content', '').rstrip() == target.rstrip():
        return {'title': before['title'], 'result': 'already_current', 'revid': before['revid'], 'sha256': sha256(target)}
    result = api({
        'action': 'edit', 'title': before['title'], 'text': target, 'token': csrf,
        'summary': 'Remove Safari-heavy mobile sidebar state work',
        'assert': 'user', 'watchlist': 'nochange',
        'starttimestamp': before['curtimestamp'], 'basetimestamp': before['timestamp'],
        'contentmodel': 'css'
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

    css = CSS_SOURCE.read_text(encoding='utf-8')
    required = [
        'html.enthusia-minerva-menu-open body.skin-minerva .enthusia-mobile-quickbar',
        'body.skin-minerva #mw-mf-page-left',
        'body.skin-minerva .main-menu-mask',
        'transition: none !important;'
    ]
    for marker in required:
        if marker not in css:
            raise RuntimeError(f'Safari performance CSS missing marker: {marker}')
    if ':has(' in css:
        raise RuntimeError('Safari performance CSS still contains :has()')

    target_css = replace_block(common_css['content'], CSS_START, CSS_END, css).rstrip() + '\n'
    css_result = edit(csrf, common_css, target_css)

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
    (OUT / 'safari-performance-evidence.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(evidence, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'MOBILE SIDEBAR SAFARI PERFORMANCE ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
