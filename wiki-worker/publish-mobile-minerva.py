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
OUT = Path(os.environ.get('WIKI_MINERVA_OUT', 'wiki-minerva-output'))
BACKUP_MANIFEST = OUT / 'full-backup' / 'manifest.json'
CSS_SOURCE = Path('wiki-worker/mobile-minerva-integration.css')
JS_SOURCE = Path('wiki-worker/mobile-minerva-integration.js')
CSS_START = '/* BEGIN ENTHUSIA MINERVA MOBILE */'
CSS_END = '/* END ENTHUSIA MINERVA MOBILE */'
JS_START = '/* BEGIN ENTHUSIA MINERVA MOBILE */'
JS_END = '/* END ENTHUSIA MINERVA MOBILE */'
UA = 'EnthusiaWikiMinervaMobile/1.1 (owner-authorized wiki publisher)'
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
    required = {'editinterface', 'editsitecss', 'editsitejs'}
    missing = required - rights
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


def expected_revid(bmap, title):
    rec = bmap.get(title)
    return (rec.get('currentRevision') or {}).get('revid') if rec else None


def guard(before, bmap):
    expected = expected_revid(bmap, before['title'])
    if expected is None:
        if not before.get('missing'):
            raise RuntimeError(f'Race detected: {before["title"]} appeared after backup at rev {before.get("revid")}')
    elif before.get('revid') != expected:
        raise RuntimeError(f'Race detected: {before["title"]} backup rev {expected}, live rev {before.get("revid")}')


def managed(existing, block, start, end):
    payload = f'{start}\n{block.strip()}\n{end}'
    if start in existing and end in existing:
        before, rest = existing.split(start, 1)
        _, after = rest.split(end, 1)
        return before.rstrip() + '\n\n' + payload + after
    return existing.rstrip() + ('\n\n' if existing.strip() else '') + payload + '\n'


def sha256(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def edit_exact(csrf, title, target, bmap, summary, contentmodel):
    before = page(title)
    guard(before, bmap)
    target = target.rstrip() + '\n'
    safe = title.replace(':', '-').replace('/', '-')
    (OUT / f'{safe}-before.json').write_text(json.dumps(before, indent=2) + '\n', encoding='utf-8')
    if before.get('content', '').rstrip() == target.rstrip():
        return {'title': title, 'result': 'already_current', 'revid': before.get('revid'), 'sha256': sha256(target)}
    params = {
        'action': 'edit', 'title': title, 'text': target, 'token': csrf, 'summary': summary,
        'assert': 'user', 'watchlist': 'nochange', 'starttimestamp': before.get('curtimestamp'),
        'contentmodel': contentmodel
    }
    if before.get('timestamp'):
        params['basetimestamp'] = before['timestamp']
    result = api(params)
    edit = result.get('edit') or {}
    if edit.get('result') != 'Success':
        raise RuntimeError(f'Edit failed for {title}: {edit}')
    after = page(title)
    if after.get('content', '').rstrip() != target.rstrip():
        raise RuntimeError(f'Readback mismatch for {title}')
    (OUT / f'{safe}-after.json').write_text(json.dumps(after, indent=2) + '\n', encoding='utf-8')
    return {
        'title': title,
        'result': 'published',
        'oldrevid': edit.get('oldrevid'),
        'newrevid': edit.get('newrevid'),
        'sha256': sha256(target)
    }


def main():
    manifest, bmap = backup_map()
    who, csrf = login()

    css_before = page('MediaWiki:Common.css')
    guard(css_before, bmap)
    css_existing = css_before.get('content', '')
    if 'BEGIN ENTHUSIA MOBILE' not in css_existing and 'BEGIN ENTHUSIA MOBILE UX' not in css_existing:
        raise RuntimeError('Existing Enthusia mobile shell marker missing from MediaWiki:Common.css')
    css_target = managed(css_existing, CSS_SOURCE.read_text(encoding='utf-8'), CSS_START, CSS_END)
    css = edit_exact(
        csrf, 'MediaWiki:Common.css', css_target, bmap,
        'Keep Enthusia Minerva mobile integration current', 'css'
    )

    js_before = page('MediaWiki:Common.js')
    guard(js_before, bmap)
    js_existing = js_before.get('content', '')
    if 'BEGIN ENTHUSIA GLOBAL THEME' not in js_existing:
        raise RuntimeError('Approved global JS marker missing from MediaWiki:Common.js')
    js_target = managed(js_existing, JS_SOURCE.read_text(encoding='utf-8'), JS_START, JS_END)
    js = edit_exact(
        csrf, 'MediaWiki:Common.js', js_target, bmap,
        'Make the top mobile menu use the Enthusia drawer', 'javascript'
    )

    evidence = {
        'authenticatedAs': who.get('name'),
        'backupCreatedAtUtc': manifest.get('createdAtUtc'),
        'backupPageCount': len(manifest.get('pages', [])),
        'commonCss': css,
        'commonJs': js,
    }
    (OUT / 'mobile-minerva-evidence.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(evidence, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'MINERVA MOBILE PUBLISH ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
