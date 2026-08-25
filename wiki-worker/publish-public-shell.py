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
OUT = Path(os.environ.get('WIKI_PUBLIC_SHELL_OUT', 'wiki-public-shell-output'))
BACKUP_MANIFEST = OUT / 'full-backup' / 'manifest.json'
SIDEBAR_SOURCE = Path('wiki-worker/public-sidebar.wiki')
JS_SOURCE = Path('wiki-worker/public-common.js')
JS_START = '/* BEGIN ENTHUSIA GLOBAL THEME */'
JS_END = '/* END ENTHUSIA GLOBAL THEME */'
RETIRED_CSS = '/* Private staging retired. Public styling is managed site-wide in MediaWiki:Common.css. */\n'
RETIRED_JS = '// Private staging retired. Public behavior is managed site-wide in MediaWiki:Common.js.\n'
UA = 'EnthusiaWikiPublicShell/1.0 (owner-authorized wiki publisher)'
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
    required = {'editinterface', 'editsitejs'}
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
        'title': title, 'missing': bool(p.get('missing')), 'revid': rev.get('revid'),
        'timestamp': rev.get('timestamp'), 'content': slot.get('content', ''),
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


def edit_exact(csrf, title, target, bmap, summary, contentmodel=None):
    before = page(title)
    guard(before, bmap)
    target = target.rstrip() + '\n'
    safe = title.replace(':', '-').replace('/', '-')
    (OUT / f'{safe}-before.json').write_text(json.dumps(before, indent=2) + '\n', encoding='utf-8')
    if before.get('content', '').rstrip() == target.rstrip():
        return {'title': title, 'result': 'already_current', 'revid': before.get('revid'), 'sha256': sha256(target)}
    params = {
        'action': 'edit', 'title': title, 'text': target, 'token': csrf, 'summary': summary,
        'assert': 'user', 'watchlist': 'nochange', 'starttimestamp': before.get('curtimestamp')
    }
    if before.get('timestamp'):
        params['basetimestamp'] = before['timestamp']
    elif contentmodel:
        params['contentmodel'] = contentmodel
    result = api(params)
    edit = result.get('edit') or {}
    if edit.get('result') != 'Success':
        raise RuntimeError(f'Edit failed for {title}: {edit}')
    after = page(title)
    if after.get('content', '').rstrip() != target.rstrip():
        raise RuntimeError(f'Readback mismatch for {title}')
    (OUT / f'{safe}-after.json').write_text(json.dumps(after, indent=2) + '\n', encoding='utf-8')
    return {'title': title, 'result': 'published', 'oldrevid': edit.get('oldrevid'), 'newrevid': edit.get('newrevid'), 'sha256': sha256(target)}


def main():
    manifest, bmap = backup_map()
    who, csrf = login()

    css = page('MediaWiki:Common.css')
    guard(css, bmap)
    css_text = css.get('content', '')
    if 'BEGIN ENTHUSIA GLOBAL THEME' not in css_text or 'data-enthusia-color-scheme' not in css_text:
        raise RuntimeError('Public Common.css does not contain the approved global theme; refusing to retire private staging')

    sidebar_target = SIDEBAR_SOURCE.read_text(encoding='utf-8')
    sidebar = edit_exact(
        csrf, 'MediaWiki:Sidebar', sidebar_target, bmap,
        'Restore full Enthusia navigation sidebar', contentmodel='wikitext'
    )
    time.sleep(2)

    js_before = page('MediaWiki:Common.js')
    guard(js_before, bmap)
    public_js = JS_SOURCE.read_text(encoding='utf-8')
    js_target = managed(js_before.get('content', ''), public_js, JS_START, JS_END)
    common_js = edit_exact(
        csrf, 'MediaWiki:Common.js', js_target, bmap,
        'Use native Vector navigation and Appearance controls', contentmodel='javascript'
    )
    time.sleep(2)

    # Only retire the account-only staging layer after the two public targets read back exactly.
    private_css = edit_exact(
        csrf, 'User:P2wn/common.css', RETIRED_CSS, bmap,
        'Retire account-only staging after public rollout', contentmodel='css'
    )
    time.sleep(2)
    private_js = edit_exact(
        csrf, 'User:P2wn/common.js', RETIRED_JS, bmap,
        'Retire account-only staging after public rollout', contentmodel='javascript'
    )

    evidence = {
        'authenticatedAs': who.get('name'),
        'backupCreatedAtUtc': manifest.get('createdAtUtc'),
        'backupPageCount': len(manifest.get('pages', [])),
        'commonCssVerifiedRevid': css.get('revid'),
        'sidebar': sidebar,
        'commonJs': common_js,
        'privateCss': private_css,
        'privateJs': private_js,
    }
    (OUT / 'public-shell-evidence.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(evidence, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'PUBLIC SHELL PUBLISH ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
