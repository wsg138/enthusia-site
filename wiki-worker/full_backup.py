#!/usr/bin/env python3
import hashlib
import json
import os
import re
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = os.environ.get('WIKI_API', 'https://enthusia.miraheze.org/w/api.php')
OUT = Path(os.environ.get('WIKI_FULL_BACKUP_OUT', 'wiki-worker-output/full-backup'))
OLD_BASELINE = os.environ.get(
    'WIKI_OLD_BASELINE_URL',
    'https://raw.githubusercontent.com/wsg138/EnthusiaSentinel-Docs/wiki-preservation-baseline/manifest.json',
)
UA = 'EnthusiaWikiPublisher/2.1 (read-only full pre-publish backup)'


def request(params, method='GET', retries=4):
    full = {'format': 'json', 'formatversion': '2', 'maxlag': '5', **params}
    headers = {'User-Agent': UA, 'Accept': 'application/json'}
    data = None
    url = API
    if method == 'POST':
        data = urllib.parse.urlencode(full).encode('utf-8')
        headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8'
    else:
        url = API + '?' + urllib.parse.urlencode(full)
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                result = json.loads(response.read().decode('utf-8'))
            if 'error' in result:
                if result['error'].get('code') == 'maxlag' and attempt + 1 < retries:
                    time.sleep(2 + attempt * 2)
                    continue
                raise RuntimeError(f"MediaWiki API error: {result['error']}")
            return result
        except urllib.error.HTTPError as exc:
            body = exc.read().decode('utf-8', 'replace')
            if exc.code in (429, 500, 502, 503, 504) and attempt + 1 < retries:
                time.sleep(2 + attempt * 2)
                continue
            raise RuntimeError(f'HTTP {exc.code}: {body[:1000]}') from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            if attempt + 1 < retries:
                time.sleep(2 + attempt * 2)
                continue
            raise
    raise RuntimeError('MediaWiki request exhausted retries')


def safe_name(title):
    readable = title.replace('/', '∕')
    readable = re.sub(r'[<>:"\\|?*\x00-\x1f]', '_', readable)[:120]
    digest = hashlib.sha256(title.encode('utf-8')).hexdigest()[:10]
    return f"{readable or 'page'}--{digest}"


def list_pages(namespace_id):
    out, cont = [], {}
    while True:
        data = request({'action': 'query', 'list': 'allpages', 'apnamespace': str(namespace_id), 'aplimit': 'max', **cont})
        out.extend(data.get('query', {}).get('allpages', []))
        cont = data.get('continue')
        if not cont:
            return out


def fetch_current(titles):
    out = []
    for i in range(0, len(titles), 25):
        data = request({
            'action': 'query', 'prop': 'revisions|info', 'titles': '|'.join(titles[i:i+25]),
            'rvprop': 'ids|timestamp|user|comment|content|contentmodel', 'rvslots': 'main', 'inprop': 'url'
        }, 'POST')
        out.extend(data.get('query', {}).get('pages', []))
    return out


def fetch_history(title):
    out, cont = [], {}
    while True:
        data = request({
            'action': 'query', 'prop': 'revisions', 'titles': title,
            'rvprop': 'ids|timestamp|user|userid|comment|size|flags|tags',
            'rvlimit': 'max', 'rvdir': 'newer', **cont
        }, 'POST')
        pages = data.get('query', {}).get('pages', [])
        if pages:
            out.extend(pages[0].get('revisions', []))
        cont = data.get('continue')
        if not cont:
            return out


def load_old_baseline():
    req = urllib.request.Request(OLD_BASELINE, headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read().decode('utf-8'))


def main():
    shutil.rmtree(OUT, ignore_errors=True)
    (OUT / 'pages').mkdir(parents=True)
    (OUT / 'history').mkdir(parents=True)

    site = request({'action': 'query', 'meta': 'siteinfo', 'siprop': 'general|namespaces|namespacealiases'})
    q = site.get('query', {})
    namespaces = []
    for ns in q.get('namespaces', {}).values():
        nsid = int(ns.get('id', -1))
        if nsid >= 0:
            namespaces.append({'id': nsid, 'name': ns.get('name', ''), 'canonical': ns.get('canonical', '')})
    namespaces.sort(key=lambda x: x['id'])

    listed = []
    for ns in namespaces:
        pages = list_pages(ns['id'])
        listed.extend(pages)
        print(f"namespace {ns['id']} ({ns['name'] or 'Main'}): {len(pages)} pages", flush=True)

    current = fetch_current([p['title'] for p in listed])
    manifest_pages = []
    contributor_totals = {}
    for idx, page in enumerate(current, 1):
        if page.get('missing'):
            continue
        rev = (page.get('revisions') or [{}])[0]
        slot = (rev.get('slots') or {}).get('main') or {}
        content = slot.get('content', '')
        filename = safe_name(page['title'])
        (OUT / 'pages' / f'{filename}.wiki').write_text(content, encoding='utf-8')
        history = fetch_history(page['title'])
        (OUT / 'history' / f'{filename}.json').write_text(json.dumps(history, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        contributors = {}
        for h in history:
            user = h.get('user') or '(hidden/unknown)'
            contributors[user] = contributors.get(user, 0) + 1
            contributor_totals[user] = contributor_totals.get(user, 0) + 1
        manifest_pages.append({
            'title': page['title'], 'pageid': page.get('pageid'), 'ns': page.get('ns'), 'canonicalurl': page.get('canonicalurl'),
            'currentRevision': {
                'revid': rev.get('revid'), 'parentid': rev.get('parentid'), 'timestamp': rev.get('timestamp'),
                'user': rev.get('user'), 'comment': rev.get('comment'),
                'contentmodel': slot.get('contentmodel') or rev.get('contentmodel')
            },
            'byteLength': len(content.encode('utf-8')), 'revisionCount': len(history),
            'contributors': [{'user': u, 'edits': n} for u, n in sorted(contributors.items(), key=lambda x: (-x[1], x[0].lower()))],
            'backupFile': f'pages/{filename}.wiki', 'historyFile': f'history/{filename}.json'
        })
        if idx % 10 == 0 or idx == len(current):
            print(f'backed up {idx}/{len(current)} pages', flush=True)

    created = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    manifest = {
        'snapshotType': 'full-pre-publish-backup', 'createdAtUtc': created,
        'sourceWiki': q.get('general', {}).get('base'), 'scope': 'all non-negative MediaWiki namespaces; exact current source plus complete revision metadata',
        'namespaces': namespaces, 'pages': manifest_pages
    }
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    old = load_old_baseline()
    oldmap = {p['title']: p for p in old.get('pages', [])}
    curmap = {p['title']: p for p in manifest_pages}
    added = sorted(set(curmap) - set(oldmap))
    removed = sorted(set(oldmap) - set(curmap))
    changed = []
    for title in sorted(set(curmap) & set(oldmap)):
        orev = (oldmap[title].get('currentRevision') or {}).get('revid')
        crev = (curmap[title].get('currentRevision') or {}).get('revid')
        if orev != crev:
            changed.append({
                'title': title, 'baselineRevid': orev, 'currentRevid': crev,
                'baselineTimestamp': (oldmap[title].get('currentRevision') or {}).get('timestamp'),
                'currentTimestamp': (curmap[title].get('currentRevision') or {}).get('timestamp'),
                'currentUser': (curmap[title].get('currentRevision') or {}).get('user'),
                'currentComment': (curmap[title].get('currentRevision') or {}).get('comment')
            })
    comparison = {
        'oldBaselineCreatedAtUtc': old.get('createdAtUtc'), 'newBackupCreatedAtUtc': created,
        'oldPageCount': len(oldmap), 'currentPageCount': len(curmap),
        'addedPages': added, 'removedPages': removed, 'changedPages': changed
    }
    (OUT / 'comparison-to-old-baseline.json').write_text(json.dumps(comparison, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (OUT / 'README.md').write_text(
        '# Enthusia full pre-publish wiki backup\n\n'
        f'Captured: {created}\n\n'
        'This is the complete live wiki immediately before the v2 publication attempt. It contains exact current page source and complete revision metadata. No wiki edit is performed by this script.\n',
        encoding='utf-8'
    )
    print(json.dumps(comparison, ensure_ascii=False, indent=2), flush=True)
    print(f'FULL_BACKUP_COMPLETE pages={len(manifest_pages)} contributors={len(contributor_totals)}', flush=True)


if __name__ == '__main__':
    main()
