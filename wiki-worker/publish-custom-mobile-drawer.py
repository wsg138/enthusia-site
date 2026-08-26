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
OUT = Path(os.environ.get('WIKI_CUSTOM_MENU_OUT', 'wiki-custom-mobile-drawer-output'))
BACKUP_MANIFEST = OUT / 'full-backup' / 'manifest.json'
OUT.mkdir(parents=True, exist_ok=True)

JS_SOURCE = Path('wiki-worker/mobile-corrections.js')
CSS_SOURCE = Path('wiki-worker/mobile-native-sidebar.css')
CORRECTIONS_START = '/* BEGIN ENTHUSIA MOBILE CORRECTIONS */'
CORRECTIONS_END = '/* END ENTHUSIA MOBILE CORRECTIONS */'
NATIVE_CSS_START = '/* BEGIN ENTHUSIA NATIVE MOBILE SIDEBAR */'
NATIVE_CSS_END = '/* END ENTHUSIA NATIVE MOBILE SIDEBAR */'
UA = 'EnthusiaWikiCustomMobileDrawer/1.0 (owner-authorized wiki publisher)'

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def api(params, method='POST'):
    full = {'format': 'json', 'formatversion': '2', 'maxlag': '5', **params}
    headers = {'User-Agent': UA, 'Accept': 'application/json'}
    if method == 'GET':
        req = urllib.request.Request(API + '?' + urllib.parse.urlencode(full), headers=headers)
    else:
        data = urllib.parse.urlencode(full).encode('utf-8')
        req = urllib.request.Request(API, data=data, headers={**headers, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'})
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
    missing = {'editinterface', 'editsitecss', 'editsitejs'} - rights
    if missing:
        raise RuntimeError('Missing interface rights: ' + ', '.join(sorted(missing)))
    csrf = api({'action': 'query', 'meta': 'tokens', 'type': 'csrf'}, 'GET')['query']['tokens']['csrftoken']
    return who, csrf


def page(title):
    data = api({
        'action': 'query', 'prop': 'revisions|info', 'titles': title,
        'rvprop': 'ids|timestamp|user|comment|content|contentmodel', 'rvslots': 'main', 'curtimestamp': '1'
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
        'contentmodel': slot.get('contentmodel') or rev.get('contentmodel'),
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
    if expected is None:
        if not before.get('missing'):
            raise RuntimeError(f'Race detected: {before["title"]} appeared after backup at rev {before.get("revid")}')
    elif before.get('revid') != expected:
        raise RuntimeError(f'Race detected: {before["title"]} backup rev {expected}, live rev {before.get("revid")}')


def replace_required_block(existing, start, end, source):
    if start not in existing or end not in existing:
        raise RuntimeError(f'Required managed block missing: {start}')
    before, rest = existing.split(start, 1)
    _, after = rest.split(end, 1)
    payload = f'{start}\n{source.strip()}\n{end}'
    return before.rstrip() + '\n\n' + payload + after


def sha256(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def edit(csrf, before, target, summary, contentmodel):
    if before.get('content', '').rstrip() == target.rstrip():
        return {
            'title': before['title'], 'result': 'already_current',
            'revid': before.get('revid'), 'sha256': sha256(target)
        }

    params = {
        'action': 'edit', 'title': before['title'], 'text': target, 'token': csrf,
        'summary': summary, 'assert': 'user', 'watchlist': 'nochange',
        'starttimestamp': before.get('curtimestamp'), 'contentmodel': contentmodel
    }
    if before.get('timestamp'):
        params['basetimestamp'] = before['timestamp']
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


def backup_revision(bmap, title):
    rec = bmap.get(title) or {}
    rev = rec.get('currentRevision') or {}
    return rev.get('revid')


def main():
    manifest, bmap = backup_map()
    who, csrf = login()

    common_js = page('MediaWiki:Common.js')
    common_css = page('MediaWiki:Common.css')
    guard(common_js, bmap)
    guard(common_css, bmap)

    # The custom drawer itself is durable code in the existing public Common.js
    # block. Refuse to publish the routing correction if that target disappeared.
    live_custom_markers = [
        'function openMobileDrawer()',
        "drawer.className = 'enthusia-mobile-drawer'",
        "shade.className = 'enthusia-mobile-shade'",
        "menuButton.addEventListener('click', openMobileDrawer);"
    ]
    for marker in live_custom_markers:
        if marker not in common_js.get('content', ''):
            raise RuntimeError(f'Live Common.js custom drawer target missing marker: {marker}')

    corrections = JS_SOURCE.read_text(encoding='utf-8')
    custom_css = CSS_SOURCE.read_text(encoding='utf-8')
    for marker in [
        'NATIVE_MENU_CONTROL_SELECTOR',
        'enthusia-custom-mobile-menu-ready',
        'openExactBottomMenu',
        'button.click()',
        'event.stopImmediatePropagation()'
    ]:
        if marker not in corrections:
            raise RuntimeError(f'Custom mobile correction source missing marker: {marker}')
    for marker in [
        'enthusia-custom-mobile-menu-ready',
        '#mw-mf-page-left',
        'html.enthusia-mobile-menu-open .enthusia-mobile-quickbar'
    ]:
        if marker not in custom_css:
            raise RuntimeError(f'Custom mobile CSS source missing marker: {marker}')

    target_js = replace_required_block(common_js.get('content', ''), CORRECTIONS_START, CORRECTIONS_END, corrections).rstrip() + '\n'
    target_css = replace_required_block(common_css.get('content', ''), NATIVE_CSS_START, NATIVE_CSS_END, custom_css).rstrip() + '\n'

    (OUT / 'MediaWiki-Common.js-before.json').write_text(json.dumps(common_js, indent=2) + '\n', encoding='utf-8')
    (OUT / 'MediaWiki-Common.css-before.json').write_text(json.dumps(common_css, indent=2) + '\n', encoding='utf-8')

    js_result = edit(csrf, common_js, target_js, 'Use the Enthusia drawer for every mobile menu control', 'javascript')

    css_now = page('MediaWiki:Common.css')
    guard(css_now, bmap)
    css_result = edit(csrf, css_now, target_css, 'Suppress native mobile panels when the Enthusia drawer is ready', 'css')

    evidence = {
        'authenticatedAs': who.get('name'),
        'backupCreatedAtUtc': manifest.get('createdAtUtc'),
        'backupPageCount': len(manifest.get('pages', [])),
        'preservedCommunityRevisions': {
            title: backup_revision(bmap, title)
            for title in ['SonOfBlood', 'Aquariom', 'We On Top (WOT)']
            if title in bmap
        },
        'commonJs': js_result,
        'commonCss': css_result,
        'finishedAtUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    }
    (OUT / 'custom-mobile-drawer-evidence.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(evidence, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'CUSTOM MOBILE DRAWER PUBLISH ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
