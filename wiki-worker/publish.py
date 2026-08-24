#!/usr/bin/env python3
import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = os.environ.get('WIKI_API', 'https://enthusia.miraheze.org/w/api.php')
USERNAME = os.environ.get('WIKI_BOT_USERNAME', '').strip()
PASSWORD = os.environ.get('WIKI_BOT_PASSWORD', '')
OUT = Path(os.environ.get('WIKI_WORKER_OUT', 'wiki-worker-output'))
RENDERED = OUT / 'rendered'
PREFLIGHT = OUT / 'preflight-current.json'
UA = 'EnthusiaWikiPublisher/2.0 (owner-authorized documentation publisher)'
BEGIN = '/* BEGIN ENTHUSIA WIKI V2 */'
END = '/* END ENTHUSIA WIKI V2 */'

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def request(params, method='POST'):
    full = {'format': 'json', 'formatversion': '2', 'maxlag': '5', **params}
    headers = {'User-Agent': UA, 'Accept': 'application/json'}
    if method == 'GET':
        url = API + '?' + urllib.parse.urlencode(full)
        req = urllib.request.Request(url, headers=headers)
    else:
        data = urllib.parse.urlencode(full).encode('utf-8')
        headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8'
        req = urllib.request.Request(API, data=data, headers=headers)
    with opener.open(req, timeout=60) as response:
        result = json.loads(response.read().decode('utf-8'))
    if 'error' in result:
        raise RuntimeError(f"MediaWiki API error: {result['error']}")
    return result


def login():
    if not USERNAME or not PASSWORD:
        raise RuntimeError('Missing WIKI_BOT_USERNAME or WIKI_BOT_PASSWORD repository secret')
    token = request({'action': 'query', 'meta': 'tokens', 'type': 'login'}, 'GET')['query']['tokens']['logintoken']
    result = request({'action': 'login', 'lgname': USERNAME, 'lgpassword': PASSWORD, 'lgtoken': token})
    status = result.get('login', {}).get('result')
    if status != 'Success':
        raise RuntimeError(f'Wiki login failed: {result.get("login")}')
    csrf = request({'action': 'query', 'meta': 'tokens'}, 'GET')['query']['tokens']['csrftoken']
    who = request({'action': 'query', 'meta': 'userinfo', 'uiprop': 'rights'}, 'GET')['query']['userinfo']
    if who.get('anon'):
        raise RuntimeError('Wiki session is anonymous after login')
    print(f"Authenticated wiki account: {who.get('name')}")
    return csrf, who


def get_page(title):
    data = request({
        'action': 'query', 'prop': 'revisions|info', 'titles': title,
        'rvprop': 'ids|timestamp|user|comment|content', 'rvslots': 'main', 'curtimestamp': '1'
    }, 'GET')
    page = data.get('query', {}).get('pages', [{}])[0]
    rev = (page.get('revisions') or [{}])[0]
    slot = (rev.get('slots') or {}).get('main') or {}
    return {
        'title': title,
        'missing': bool(page.get('missing')),
        'pageid': page.get('pageid'),
        'revid': rev.get('revid'),
        'timestamp': rev.get('timestamp'),
        'user': rev.get('user'),
        'comment': rev.get('comment'),
        'content': slot.get('content', ''),
        'curtimestamp': data.get('curtimestamp'),
    }


def merge_managed_css(existing, managed):
    block_re = re.compile(re.escape(BEGIN) + r'.*?' + re.escape(END), re.S)
    managed_block = managed.strip()
    if block_re.search(existing):
        return block_re.sub(managed_block, existing).rstrip() + '\n'
    prefix = existing.rstrip()
    return (prefix + '\n\n' if prefix else '') + managed_block + '\n'


def edit_page(csrf, title, text, before, summary):
    params = {
        'action': 'edit', 'title': title, 'text': text, 'token': csrf,
        'summary': summary, 'assert': 'user', 'watchlist': 'nochange',
        'starttimestamp': before.get('curtimestamp') or time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }
    if not before.get('missing') and before.get('timestamp'):
        params['basetimestamp'] = before['timestamp']
    result = request(params)
    edit = result.get('edit', {})
    if edit.get('result') != 'Success':
        raise RuntimeError(f'Edit failed for {title}: {edit}')
    return edit


def safe_file(title):
    return re.sub(r'[^A-Za-z0-9._-]+', '_', title)[:140] or 'page'


def main():
    if not (RENDERED / 'manifest.json').exists() or not PREFLIGHT.exists():
        raise RuntimeError('Rendered source or preflight state is missing')
    manifest = json.loads((RENDERED / 'manifest.json').read_text(encoding='utf-8'))
    preflight = json.loads(PREFLIGHT.read_text(encoding='utf-8'))
    expected = {p['title']: (p.get('currentRevision') or {}).get('revid') for p in preflight.get('pages', [])}

    backup_dir = OUT / 'pre-edit'
    post_dir = OUT / 'post-edit'
    backup_dir.mkdir(parents=True, exist_ok=True)
    post_dir.mkdir(parents=True, exist_ok=True)

    csrf, who = login()
    targets = manifest['pages']
    targets = sorted(targets, key=lambda p: (0 if p['title'] == 'MediaWiki:Common.css' else 2 if p['title'] == 'Main Page' else 1, p['title']))

    plan = []
    for item in targets:
        title = item['title']
        before = get_page(title)
        expected_revid = expected.get(title)
        if expected_revid is not None and before.get('revid') != expected_revid:
            raise RuntimeError(f'Race detected before publish: {title} changed from expected rev {expected_revid} to {before.get("revid")}')
        if expected_revid is None and not before.get('missing'):
            raise RuntimeError(f'Race detected before publish: new target page now exists: {title} rev {before.get("revid")}')
        source = (RENDERED / item['filename']).read_text(encoding='utf-8')
        text = merge_managed_css(before['content'], source) if item.get('managedSection') else source
        (backup_dir / f'{safe_file(title)}.json').write_text(json.dumps(before, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        plan.append((item, before, text))

    report = {'wikiUser': who.get('name'), 'startedAtUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'edits': []}
    for item, before, text in plan:
        title = item['title']
        if before.get('content') == text:
            report['edits'].append({'title': title, 'result': 'unchanged', 'revid': before.get('revid')})
            print(f'UNCHANGED {title}')
            continue
        edit = edit_page(csrf, title, text, before, 'Update Enthusia player wiki documentation')
        after = get_page(title)
        (post_dir / f'{safe_file(title)}.json').write_text(json.dumps(after, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        if after.get('content', '').rstrip() != text.rstrip():
            raise RuntimeError(f'Readback verification failed for {title} at rev {after.get("revid")}')
        report['edits'].append({'title': title, 'result': 'published', 'oldrevid': edit.get('oldrevid'), 'newrevid': edit.get('newrevid')})
        print(f'PUBLISHED {title}: {edit.get("oldrevid")} -> {edit.get("newrevid")}')

    report['finishedAtUtc'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    (OUT / 'publish-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"Publish complete: {len(report['edits'])} targets")


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'PUBLISH ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
