#!/usr/bin/env python3
import hashlib, http.cookiejar, json, os, time, urllib.parse, urllib.request
from pathlib import Path

API = os.environ.get('WIKI_API', 'https://enthusia.miraheze.org/w/api.php')
USERNAME = os.environ['WIKI_BOT_USERNAME'].strip()
PASSWORD = os.environ['WIKI_BOT_PASSWORD']
OUT = Path(os.environ.get('WIKI_GLOBAL_THEME_OUT', 'wiki-global-theme-output'))
BACKUP_MANIFEST = Path(os.environ.get('WIKI_FULL_BACKUP_OUT', 'wiki-global-theme-output/full-backup')) / 'manifest.json'
ROOT = Path(__file__).resolve().parent.parent
BRAND_SOURCE = ROOT / 'wiki-worker' / 'player-card-and-brand' / 'common-brand.css'
SOURCE_CSS = 'User:P2wn/common.css'
SOURCE_JS = 'User:P2wn/common.js'
DEST_CSS = 'MediaWiki:Common.css'
DEST_JS = 'MediaWiki:Common.js'
CSS_START = '/* BEGIN ENTHUSIA GLOBAL THEME */'
CSS_END = '/* END ENTHUSIA GLOBAL THEME */'
JS_START = '/* BEGIN ENTHUSIA GLOBAL THEME */'
JS_END = '/* END ENTHUSIA GLOBAL THEME */'
OUT.mkdir(parents=True, exist_ok=True)

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def api(params, method='POST'):
    full = {'format': 'json', 'formatversion': '2', 'maxlag': '5', **params}
    headers = {'User-Agent': 'EnthusiaWikiGlobalTheme/1.0', 'Accept': 'application/json'}
    if method == 'GET':
        req = urllib.request.Request(API + '?' + urllib.parse.urlencode(full), headers=headers)
    else:
        body = urllib.parse.urlencode(full).encode()
        req = urllib.request.Request(API, data=body, headers={**headers, 'Content-Type': 'application/x-www-form-urlencoded'})
    with opener.open(req, timeout=90) as response:
        result = json.load(response)
    if 'error' in result:
        raise RuntimeError(result['error'])
    return result


def login():
    token = api({'action': 'query', 'meta': 'tokens', 'type': 'login'}, 'GET')['query']['tokens']['logintoken']
    result = api({'action': 'login', 'lgname': USERNAME, 'lgpassword': PASSWORD, 'lgtoken': token})
    if result.get('login', {}).get('result') != 'Success':
        raise RuntimeError(f'Login failed: {result}')
    who = api({'action': 'query', 'meta': 'userinfo', 'uiprop': 'rights|groups'}, 'GET')['query']['userinfo']
    if who.get('anon'):
        raise RuntimeError('Authentication failed')
    rights = set(who.get('rights') or [])
    required = {'editinterface', 'editsitecss', 'editsitejs'}
    status = {
        'authenticatedAs': who.get('name'),
        'groups': who.get('groups'),
        'hasEditInterface': 'editinterface' in rights,
        'hasEditSiteCss': 'editsitecss' in rights,
        'hasEditSiteJs': 'editsitejs' in rights,
    }
    print(json.dumps(status, indent=2))
    missing = required - rights
    if missing:
        raise RuntimeError('Missing required interface rights: ' + ', '.join(sorted(missing)))
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
        'timestamp': rev.get('timestamp'), 'user': rev.get('user'), 'comment': rev.get('comment'),
        'content': slot.get('content', ''), 'contentmodel': slot.get('contentmodel') or rev.get('contentmodel'),
        'curtimestamp': data.get('curtimestamp')
    }


def backup_map():
    if not BACKUP_MANIFEST.exists():
        raise RuntimeError('Fresh full-backup manifest is missing')
    manifest = json.loads(BACKUP_MANIFEST.read_text(encoding='utf-8'))
    return manifest, {p.get('title'): p for p in manifest.get('pages', [])}


def expected_revid(bmap, title):
    record = bmap.get(title)
    return (record.get('currentRevision') or {}).get('revid') if record else None


def check_race(before, bmap):
    expected = expected_revid(bmap, before['title'])
    if expected is not None and before.get('revid') != expected:
        raise RuntimeError(f'Race detected after backup: {before["title"]} changed from rev {expected} to {before.get("revid")}')
    if expected is None and not before.get('missing'):
        raise RuntimeError(f'Race detected after backup: {before["title"]} appeared at rev {before.get("revid")}')


def managed(existing, block, start, end):
    block = block.strip()
    payload = f'{start}\n{block}\n{end}'
    if start in existing and end in existing:
        before, rest = existing.split(start, 1)
        _, after = rest.split(end, 1)
        return before.rstrip() + '\n\n' + payload + after
    return existing.rstrip() + ('\n\n' if existing.strip() else '') + payload + '\n'


def sha256(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def publish(csrf, source, dest, content_model, start, end, bmap, summary, strip_brand=False):
    source_before = page(source)
    check_race(source_before, bmap)
    if source_before.get('missing') or not source_before.get('content', '').strip():
        raise RuntimeError(f'Approved private source is missing or empty: {source}')
    source_text = source_before['content'].rstrip() + '\n'
    if strip_brand:
        brand = BRAND_SOURCE.read_text(encoding='utf-8').strip()
        source_text = source_text.replace(brand, '').strip() + '\n'

    dest_before = page(dest)
    check_race(dest_before, bmap)
    if not dest_before.get('missing') and dest_before.get('contentmodel') not in (content_model, None):
        raise RuntimeError(f'Unexpected content model for {dest}: {dest_before.get("contentmodel")}')
    target = managed(dest_before.get('content', ''), source_text, start, end)

    safe = dest.replace(':', '-').replace('/', '-')
    (OUT / f'{safe}-before.json').write_text(json.dumps(dest_before, indent=2) + '\n', encoding='utf-8')
    (OUT / f'{safe}-source.json').write_text(json.dumps({
        'title': source, 'revid': source_before.get('revid'), 'timestamp': source_before.get('timestamp'),
        'sha256': sha256(source_text), 'bytes': len(source_text.encode('utf-8'))
    }, indent=2) + '\n', encoding='utf-8')
    (OUT / f'{safe}-approved-source.txt').write_text(source_text, encoding='utf-8')

    if dest_before.get('content', '').rstrip() == target.rstrip():
        return {
            'title': dest, 'result': 'already_current', 'revid': dest_before.get('revid'),
            'sourceTitle': source, 'sourceRevid': source_before.get('revid'), 'sourceSha256': sha256(source_text)
        }

    params = {
        'action': 'edit', 'title': dest, 'text': target, 'token': csrf, 'summary': summary,
        'assert': 'user', 'watchlist': 'nochange',
        'starttimestamp': dest_before.get('curtimestamp') or time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    }
    if dest_before.get('timestamp'):
        params['basetimestamp'] = dest_before['timestamp']
    else:
        params['contentmodel'] = content_model
    result = api(params)
    edit = result.get('edit') or {}
    if edit.get('result') != 'Success':
        raise RuntimeError(f'Edit failed for {dest}: {edit}')
    after = page(dest)
    (OUT / f'{safe}-after.json').write_text(json.dumps(after, indent=2) + '\n', encoding='utf-8')
    if after.get('content', '').rstrip() != target.rstrip():
        raise RuntimeError(f'Readback mismatch for {dest}')
    if after.get('contentmodel') != content_model:
        raise RuntimeError(f'Content model mismatch for {dest}: {after.get("contentmodel")}')
    return {
        'title': dest, 'result': 'published', 'oldrevid': edit.get('oldrevid'), 'newrevid': edit.get('newrevid'),
        'sourceTitle': source, 'sourceRevid': source_before.get('revid'), 'sourceSha256': sha256(source_text)
    }


def main():
    manifest, bmap = backup_map()
    who, csrf = login()
    css = publish(
        csrf, SOURCE_CSS, DEST_CSS, 'css', CSS_START, CSS_END, bmap,
        'Publish approved Enthusia Vector redesign for everyone', strip_brand=True
    )
    time.sleep(2)
    js = publish(
        csrf, SOURCE_JS, DEST_JS, 'javascript', JS_START, JS_END, bmap,
        'Publish approved Enthusia wiki interactions for everyone'
    )
    evidence = {
        'authenticatedAs': who.get('name'), 'backupCreatedAtUtc': manifest.get('createdAtUtc'),
        'backupPageCount': len(manifest.get('pages', [])), 'css': css, 'js': js
    }
    (OUT / 'evidence.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(evidence, indent=2))


if __name__ == '__main__':
    main()
