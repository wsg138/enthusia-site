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
OUT = Path(os.environ.get('WIKI_NATIVE_MENU_OUT', 'wiki-native-mobile-sidebar-output'))
BACKUP_MANIFEST = OUT / 'full-backup' / 'manifest.json'
OUT.mkdir(parents=True, exist_ok=True)

JS_CORRECTIONS = Path('wiki-worker/mobile-corrections.js')
JS_MINERVA = Path('wiki-worker/mobile-minerva-integration.js')
CSS_NATIVE = Path('wiki-worker/mobile-native-sidebar.css')
SIDEBAR_SOURCE = Path('wiki-worker/public-sidebar.wiki')

CORRECTIONS_START = '/* BEGIN ENTHUSIA MOBILE CORRECTIONS */'
CORRECTIONS_END = '/* END ENTHUSIA MOBILE CORRECTIONS */'
MINERVA_START = '/* BEGIN ENTHUSIA MINERVA MOBILE */'
MINERVA_END = '/* END ENTHUSIA MINERVA MOBILE */'
NATIVE_CSS_START = '/* BEGIN ENTHUSIA NATIVE MOBILE SIDEBAR */'
NATIVE_CSS_END = '/* END ENTHUSIA NATIVE MOBILE SIDEBAR */'
UA = 'EnthusiaWikiNativeMobileSidebar/1.0 (owner-authorized wiki publisher)'

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
    return manifest, {p.get('title'): p for p in manifest.get('pages', [])}


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


def replace_or_append_block(existing, start, end, source):
    payload = f'{start}\n{source.strip()}\n{end}'
    if start in existing and end in existing:
        before, rest = existing.split(start, 1)
        _, after = rest.split(end, 1)
        return before.rstrip() + '\n\n' + payload + after
    return existing.rstrip() + ('\n\n' if existing.strip() else '') + payload + '\n'


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


def main():
    manifest, bmap = backup_map()
    who, csrf = login()

    common_js = page('MediaWiki:Common.js')
    common_css = page('MediaWiki:Common.css')
    sidebar = page('MediaWiki:Sidebar')
    for current in (common_js, common_css, sidebar):
        guard(current, bmap)

    expected_sidebar = SIDEBAR_SOURCE.read_text(encoding='utf-8').rstrip()
    if sidebar.get('content', '').rstrip() != expected_sidebar:
        raise RuntimeError('Live MediaWiki:Sidebar no longer matches the approved public-sidebar.wiki source; refusing to build mobile navigation from stale assumptions')

    corrections = JS_CORRECTIONS.read_text(encoding='utf-8')
    minerva = JS_MINERVA.read_text(encoding='utf-8')
    native_css = CSS_NATIVE.read_text(encoding='utf-8')

    if 'NAV_GROUPS' in corrections or 'makeNativeMenuSections' in corrections:
        raise RuntimeError('Hard-coded duplicate navigation is still present in mobile-corrections.js')
    if 'openEnthusiaDrawer' in minerva or 'stopImmediatePropagation' in minerva:
        raise RuntimeError('Minerva integration still intercepts native navigation')
    if 'NATIVE_MENU_CONTROL_SELECTOR' not in corrections or 'enthusia-native-sidebar' not in native_css:
        raise RuntimeError('Native-sidebar bridge/style source is incomplete')

    target_js = replace_required_block(common_js.get('content', ''), CORRECTIONS_START, CORRECTIONS_END, corrections)
    target_js = replace_required_block(target_js, MINERVA_START, MINERVA_END, minerva).rstrip() + '\n'
    target_css = replace_or_append_block(common_css.get('content', ''), NATIVE_CSS_START, NATIVE_CSS_END, native_css).rstrip() + '\n'

    (OUT / 'MediaWiki-Common.js-before.json').write_text(json.dumps(common_js, indent=2) + '\n', encoding='utf-8')
    (OUT / 'MediaWiki-Common.css-before.json').write_text(json.dumps(common_css, indent=2) + '\n', encoding='utf-8')
    (OUT / 'MediaWiki-Sidebar-verified.json').write_text(json.dumps(sidebar, indent=2) + '\n', encoding='utf-8')

    js_result = edit(csrf, common_js, target_js, 'Use native mobile sidebar as the single Enthusia menu', 'javascript')

    # Re-read CSS after the JS write. It is a different page, but preserve the
    # fresh-backup race guarantee before making the second edit.
    css_now = page('MediaWiki:Common.css')
    guard(css_now, bmap)
    css_result = edit(csrf, css_now, target_css, 'Style the native Enthusia mobile sidebar', 'css')

    evidence = {
        'authenticatedAs': who.get('name'),
        'backupCreatedAtUtc': manifest.get('createdAtUtc'),
        'backupPageCount': len(manifest.get('pages', [])),
        'sidebarVerifiedRevision': sidebar.get('revid'),
        'commonJs': js_result,
        'commonCss': css_result,
        'finishedAtUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    }
    (OUT / 'native-mobile-sidebar-evidence.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(evidence, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'NATIVE MOBILE SIDEBAR PUBLISH ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
