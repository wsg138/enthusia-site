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
OUT = Path(os.environ.get('WIKI_NATIVE_RESTORE_OUT', 'wiki-native-restore-output'))
BACKUP_MANIFEST = OUT / 'full-backup' / 'manifest.json'
JS_SOURCE = Path('wiki-worker/mobile-corrections.js')
CSS_SOURCE = Path('wiki-worker/mobile-native-sidebar.css')
JS_START = '/* BEGIN ENTHUSIA MOBILE CORRECTIONS */'
JS_END = '/* END ENTHUSIA MOBILE CORRECTIONS */'
CSS_START = '/* BEGIN ENTHUSIA NATIVE MOBILE SIDEBAR */'
CSS_END = '/* END ENTHUSIA NATIVE MOBILE SIDEBAR */'
UA = 'EnthusiaWikiNativeRestore/1.0 (owner-authorized regression rollback)'
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
    missing = {'editinterface', 'editsitecss', 'editsitejs'} - rights
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
        'missing': bool(p.get('missing')),
        'revid': rev.get('revid'),
        'timestamp': rev.get('timestamp'),
        'content': slot.get('content', ''),
        'curtimestamp': data.get('curtimestamp')
    }


def backup_map():
    if not BACKUP_MANIFEST.exists():
        raise RuntimeError('Fresh full backup manifest missing')
    manifest = json.loads(BACKUP_MANIFEST.read_text(encoding='utf-8'))
    return manifest, {p.get('title'): p for p in manifest.get('pages', [])}


def guard(before, bmap):
    rec = bmap.get(before['title'])
    expected = (rec.get('currentRevision') or {}).get('revid') if rec else None
    if expected is None or before.get('revid') != expected:
        raise RuntimeError(f'Race detected for {before["title"]}: backup {expected}, live {before.get("revid")}')


def replace_block(existing, start, end, source):
    if start not in existing or end not in existing:
        raise RuntimeError(f'Required managed block missing: {start}')
    before, rest = existing.split(start, 1)
    _, after = rest.split(end, 1)
    return before.rstrip() + '\n\n' + start + '\n' + source.strip() + '\n' + end + after


def sha256(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def edit(csrf, before, target, summary, contentmodel):
    if before.get('content', '').rstrip() == target.rstrip():
        return {'title': before['title'], 'result': 'already_current', 'revid': before['revid'], 'sha256': sha256(target)}
    params = {
        'action': 'edit', 'title': before['title'], 'text': target, 'token': csrf,
        'summary': summary, 'assert': 'user', 'watchlist': 'nochange',
        'starttimestamp': before['curtimestamp'], 'basetimestamp': before['timestamp'],
        'contentmodel': contentmodel
    }
    result = api(params).get('edit') or {}
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
    return api({'action': 'purge', 'titles': 'Main Page|MediaWiki:Common.js|MediaWiki:Common.css', 'forcelinkupdate': '1'})


def backup_revision(bmap, title):
    rec = bmap.get(title) or {}
    return (rec.get('currentRevision') or {}).get('revid')


def main():
    manifest, bmap = backup_map()
    who, csrf = login()
    common_js = page('MediaWiki:Common.js')
    common_css = page('MediaWiki:Common.css')
    guard(common_js, bmap)
    guard(common_css, bmap)

    js = JS_SOURCE.read_text(encoding='utf-8')
    css = CSS_SOURCE.read_text(encoding='utf-8')
    for marker in ['openNativeMenu', 'bindBottomMenuToNativeSidebar', 'ensureMinervaSidebar']:
        if marker not in js:
            raise RuntimeError(f'Rollback JS missing expected marker: {marker}')
    for forbidden in ['NATIVE_MENU_CONTROL_SELECTOR', 'enthusia-custom-mobile-menu-ready', 'openExactBottomMenu']:
        if forbidden in js:
            raise RuntimeError(f'Rollback JS still contains regression marker: {forbidden}')
    if '.enthusia-minerva-nav' not in css or 'enthusia-custom-mobile-menu-ready' in css:
        raise RuntimeError('Rollback CSS is not the known native-sidebar version')

    target_js = replace_block(common_js['content'], JS_START, JS_END, js).rstrip() + '\n'
    target_css = replace_block(common_css['content'], CSS_START, CSS_END, css).rstrip() + '\n'
    js_result = edit(csrf, common_js, target_js, 'Restore working native mobile menu after custom interception regression', 'javascript')

    css_now = page('MediaWiki:Common.css')
    guard(css_now, bmap)
    css_result = edit(csrf, css_now, target_css, 'Restore working native mobile sidebar after custom interception regression', 'css')

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
        'commonJs': js_result,
        'commonCss': css_result,
        'purgeResponses': [purge_one.get('purge'), purge_two.get('purge')],
        'finishedAtUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    }
    (OUT / 'native-restore-evidence.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(evidence, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'NATIVE RESTORE ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
