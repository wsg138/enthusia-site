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
JS_CORRECTIONS = Path('wiki-worker/mobile-corrections.js')
JS_MINERVA = Path('wiki-worker/mobile-minerva-integration.js')
JS_CLOSE = Path('wiki-worker/mobile-sidebar-close-controls.js')
CSS_NATIVE = Path('wiki-worker/mobile-native-sidebar.css')
SIDEBAR_SOURCE = Path('wiki-worker/public-sidebar.wiki')
CORRECTIONS_START = '/* BEGIN ENTHUSIA MOBILE CORRECTIONS */'
CORRECTIONS_END = '/* END ENTHUSIA MOBILE CORRECTIONS */'
MINERVA_START = '/* BEGIN ENTHUSIA MINERVA MOBILE */'
MINERVA_END = '/* END ENTHUSIA MINERVA MOBILE */'
CLOSE_START = '/* BEGIN ENTHUSIA MOBILE SIDEBAR CLOSE CONTROLS */'
CLOSE_END = '/* END ENTHUSIA MOBILE SIDEBAR CLOSE CONTROLS */'
CSS_START = '/* BEGIN ENTHUSIA NATIVE MOBILE SIDEBAR */'
CSS_END = '/* END ENTHUSIA NATIVE MOBILE SIDEBAR */'
UA = 'EnthusiaWikiMobileNativePerformance/2.0 (owner-authorized interface fix)'
OUT.mkdir(parents=True, exist_ok=True)
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def api(params, method='POST'):
    full = {'format': 'json', 'formatversion': '2', 'maxlag': '5', **params}
    headers = {'User-Agent': UA, 'Accept': 'application/json'}
    if method == 'GET':
        req = urllib.request.Request(API + '?' + urllib.parse.urlencode(full), headers=headers)
    else:
        req = urllib.request.Request(API, data=urllib.parse.urlencode(full).encode('utf-8'), headers={**headers, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'})
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
    data = api({'action': 'query', 'prop': 'revisions|info', 'titles': title, 'rvprop': 'ids|timestamp|content|contentmodel', 'rvslots': 'main', 'curtimestamp': '1'}, 'GET')
    p = data['query']['pages'][0]
    rev = (p.get('revisions') or [{}])[0]
    slot = (rev.get('slots') or {}).get('main') or {}
    return {'title': title, 'missing': bool(p.get('missing')), 'revid': rev.get('revid'), 'timestamp': rev.get('timestamp'), 'content': slot.get('content', ''), 'contentmodel': slot.get('contentmodel') or rev.get('contentmodel'), 'curtimestamp': data.get('curtimestamp')}


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


def sha256(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def edit(csrf, before, target, summary, contentmodel):
    if before.get('content', '').rstrip() == target.rstrip():
        return {'title': before['title'], 'result': 'already_current', 'revid': before.get('revid'), 'sha256': sha256(target)}
    params = {'action': 'edit', 'title': before['title'], 'text': target, 'token': csrf, 'summary': summary, 'assert': 'user', 'watchlist': 'nochange', 'starttimestamp': before.get('curtimestamp'), 'contentmodel': contentmodel}
    if before.get('timestamp'):
        params['basetimestamp'] = before['timestamp']
    result = api(params).get('edit') or {}
    if result.get('result') != 'Success':
        raise RuntimeError(f'Edit failed for {before["title"]}: {result}')
    after = page(before['title'])
    if after.get('content', '').rstrip() != target.rstrip():
        raise RuntimeError(f'Readback mismatch for {before["title"]}')
    return {'title': before['title'], 'result': 'published', 'oldrevid': result.get('oldrevid'), 'newrevid': result.get('newrevid'), 'sha256': sha256(target)}


def purge():
    return api({'action': 'purge', 'titles': 'Main Page|MediaWiki:Common.js|MediaWiki:Common.css', 'forcelinkupdate': '1'})


def backup_revision(bmap, title):
    rec = bmap.get(title) or {}
    return (rec.get('currentRevision') or {}).get('revid')


def validate_sources(corrections, minerva, close_controls, native_css):
    if 'SIDEBAR_GROUPS' not in corrections or 'toggle.click()' not in corrections:
        raise RuntimeError('Mobile corrections no longer contain the approved native-menu bridge')
    for source_name, source in [('mobile-corrections.js', corrections), ('mobile-sidebar-close-controls.js', close_controls)]:
        if 'enthusia-minerva-menu-open' in source:
            raise RuntimeError(f'{source_name} still mirrors native menu state into an Enthusia class')
        if "addEventListener('change'" in source or "dispatchEvent(new Event('change'" in source or 'input.checked =' in source:
            raise RuntimeError(f'{source_name} still synthesizes native menu state changes')
    if 'MutationObserver' in minerva:
        raise RuntimeError('Minerva branding still watches the whole mobile DOM')
    if "document.createElement('label')" not in close_controls or 'htmlFor = input.id' not in close_controls:
        raise RuntimeError('Close control is not delegating to the native checkbox label behavior')
    for marker in ['body.skin-minerva .enthusia-mobile-quickbar', 'backdrop-filter: none !important;', '-webkit-backdrop-filter: none !important;', 'will-change: transform;', 'transition: none !important;']:
        if marker not in native_css:
            raise RuntimeError(f'Native mobile performance CSS missing marker: {marker}')
    if 'enthusia-minerva-menu-open' in native_css or 'body.skin-minerva:has(' in native_css:
        raise RuntimeError('Native mobile CSS still depends on mirrored/relational menu state')


def main():
    manifest, bmap = backup_map()
    who, csrf = login()
    common_js = page('MediaWiki:Common.js')
    common_css = page('MediaWiki:Common.css')
    sidebar = page('MediaWiki:Sidebar')
    for current in (common_js, common_css, sidebar):
        guard(current, bmap)
    if sidebar.get('content', '').rstrip() != SIDEBAR_SOURCE.read_text(encoding='utf-8').rstrip():
        raise RuntimeError('Live MediaWiki:Sidebar no longer matches public-sidebar.wiki')
    corrections = JS_CORRECTIONS.read_text(encoding='utf-8')
    minerva = JS_MINERVA.read_text(encoding='utf-8')
    close_controls = JS_CLOSE.read_text(encoding='utf-8')
    native_css = CSS_NATIVE.read_text(encoding='utf-8')
    validate_sources(corrections, minerva, close_controls, native_css)
    target_js = replace_required_block(common_js['content'], CORRECTIONS_START, CORRECTIONS_END, corrections)
    target_js = replace_required_block(target_js, MINERVA_START, MINERVA_END, minerva)
    target_js = replace_required_block(target_js, CLOSE_START, CLOSE_END, close_controls).rstrip() + '\n'
    target_css = replace_required_block(common_css['content'], CSS_START, CSS_END, native_css).rstrip() + '\n'
    (OUT / 'MediaWiki-Common.js-before.json').write_text(json.dumps(common_js, indent=2) + '\n', encoding='utf-8')
    (OUT / 'MediaWiki-Common.css-before.json').write_text(json.dumps(common_css, indent=2) + '\n', encoding='utf-8')
    (OUT / 'MediaWiki-Sidebar-verified.json').write_text(json.dumps(sidebar, indent=2) + '\n', encoding='utf-8')
    js_result = edit(csrf, common_js, target_js, 'Decouple Enthusia code from native mobile menu state', 'javascript')
    css_now = page('MediaWiki:Common.css')
    guard(css_now, bmap)
    css_result = edit(csrf, css_now, target_css, 'Reduce mobile Safari menu compositing work', 'css')
    purge_one = purge()
    time.sleep(2)
    purge_two = purge()
    evidence = {'authenticatedAs': who.get('name'), 'backupCreatedAtUtc': manifest.get('createdAtUtc'), 'backupPageCount': len(manifest.get('pages', [])), 'sidebarVerifiedRevision': sidebar.get('revid'), 'preservedCommunityRevisions': {title: backup_revision(bmap, title) for title in ['SonOfBlood', 'Aquariom', 'We On Top (WOT)'] if title in bmap}, 'commonJs': js_result, 'commonCss': css_result, 'purgeResponses': [purge_one.get('purge'), purge_two.get('purge')], 'finishedAtUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    (OUT / 'safari-performance-evidence.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(evidence, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'MOBILE SIDEBAR NATIVE PERFORMANCE ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
