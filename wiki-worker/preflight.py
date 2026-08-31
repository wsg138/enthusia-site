#!/usr/bin/env python3
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from safety import baseline_manifest_url, project_output_path, wiki_api_url

API = wiki_api_url(os.environ.get('WIKI_API'))
BASELINE_URL = baseline_manifest_url(os.environ.get('WIKI_BASELINE_URL'))
OUT = project_output_path(os.environ.get('WIKI_WORKER_OUT'))
UA = 'EnthusiaWikiWorker/2.0 (pre-publish conflict check)'


def http_json(url, data=None, retries=4):
    headers = {'User-Agent': UA, 'Accept': 'application/json'}
    if data is not None:
        data = urllib.parse.urlencode(data).encode('utf-8')
        headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8'
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=data, headers=headers)
            with urllib.request.urlopen(req, timeout=45) as response:
                result = json.loads(response.read().decode('utf-8'))
            if result.get('error', {}).get('code') == 'maxlag' and attempt + 1 < retries:
                time.sleep(2 + attempt * 2)
                continue
            if 'error' in result:
                raise RuntimeError(f"MediaWiki API error: {result['error']}")
            return result
        except (urllib.error.URLError, TimeoutError) as exc:
            if attempt + 1 < retries:
                time.sleep(2 + attempt * 2)
                continue
            raise RuntimeError(f'Unable to reach {url}: {exc}') from exc


def api(params, method='GET'):
    full = {'format': 'json', 'formatversion': '2', 'maxlag': '5', **params}
    if method == 'POST':
        return http_json(API, full)
    return http_json(API + '?' + urllib.parse.urlencode(full))


def fetch_baseline():
    req = urllib.request.Request(BASELINE_URL, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=45) as response:
        return json.loads(response.read().decode('utf-8'))


def list_all_pages(ns):
    pages = []
    cont = {}
    while True:
        data = api({'action': 'query', 'list': 'allpages', 'apnamespace': ns, 'aplimit': 'max', **cont})
        pages.extend(data.get('query', {}).get('allpages', []))
        cont = data.get('continue')
        if not cont:
            return pages


def current_manifest():
    site = api({'action': 'query', 'meta': 'siteinfo', 'siprop': 'general|namespaces'})
    namespaces = sorted(
        int(ns['id']) for ns in site['query']['namespaces'].values() if int(ns['id']) >= 0
    )
    titles = []
    for ns in namespaces:
        titles.extend(p['title'] for p in list_all_pages(ns))

    pages = []
    for i in range(0, len(titles), 40):
        batch = titles[i:i+40]
        data = api({
            'action': 'query',
            'prop': 'revisions|info',
            'titles': '|'.join(batch),
            'rvprop': 'ids|timestamp|user|comment',
            'inprop': 'url',
        }, method='POST')
        for page in data.get('query', {}).get('pages', []):
            if page.get('missing'):
                continue
            rev = (page.get('revisions') or [{}])[0]
            pages.append({
                'title': page['title'],
                'pageid': page.get('pageid'),
                'ns': page.get('ns'),
                'canonicalurl': page.get('canonicalurl'),
                'currentRevision': {
                    'revid': rev.get('revid'),
                    'parentid': rev.get('parentid'),
                    'timestamp': rev.get('timestamp'),
                    'user': rev.get('user'),
                    'comment': rev.get('comment'),
                },
            })
    return {
        'createdAtUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'sourceWiki': site['query']['general'].get('base'),
        'pages': pages,
    }


def page_map(manifest):
    return {p['title']: p for p in manifest.get('pages', [])}


def compare(baseline, current):
    before, after = page_map(baseline), page_map(current)
    changed = []
    for title in sorted(set(before) & set(after)):
        br = (before[title].get('currentRevision') or {}).get('revid')
        ar = (after[title].get('currentRevision') or {}).get('revid')
        if br != ar:
            changed.append({
                'title': title,
                'baselineRevid': br,
                'currentRevid': ar,
                'baselineTimestamp': (before[title].get('currentRevision') or {}).get('timestamp'),
                'currentTimestamp': (after[title].get('currentRevision') or {}).get('timestamp'),
                'currentUser': (after[title].get('currentRevision') or {}).get('user'),
                'currentComment': (after[title].get('currentRevision') or {}).get('comment'),
            })
    return {
        'baselineCreatedAtUtc': baseline.get('createdAtUtc'),
        'checkedAtUtc': current.get('createdAtUtc'),
        'baselinePageCount': len(before),
        'currentPageCount': len(after),
        'addedPages': sorted(set(after) - set(before)),
        'removedPages': sorted(set(before) - set(after)),
        'changedPages': changed,
        'unchanged': not changed and not (set(after) - set(before)) and not (set(before) - set(after)),
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    baseline = fetch_baseline()
    current = current_manifest()
    result = compare(baseline, current)
    (OUT / 'preflight-current.json').write_text(json.dumps(current, indent=2) + '\n', encoding='utf-8')
    (OUT / 'preflight-comparison.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, indent=2))
    if not result['unchanged']:
        print('LIVE_WIKI_DRIFT_DETECTED=1')
        sys.exit(3)
    print('LIVE_WIKI_UNCHANGED=1')


if __name__ == '__main__':
    main()
