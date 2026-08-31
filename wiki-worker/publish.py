#!/usr/bin/env python3
import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from safety import contained_file, project_output_path, wiki_api_url

API = wiki_api_url(os.environ.get('WIKI_API'))
USERNAME = os.environ.get('WIKI_BOT_USERNAME', '').strip()
PASSWORD = os.environ.get('WIKI_BOT_PASSWORD', '')
OUT = project_output_path(os.environ.get('WIKI_WORKER_OUT'))
RENDERED = OUT / 'rendered'
FULL_BACKUP = OUT / 'full-backup' / 'manifest.json'
UA = 'EnthusiaWikiPublisher/2.4 (owner-authorized documentation publisher)'
EDIT_DELAY_SECONDS = float(os.environ.get('WIKI_EDIT_DELAY_SECONDS', '8.5'))

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def request(params, method='POST', retries=6):
    full = {'format': 'json', 'formatversion': '2', 'maxlag': '5', **params}
    headers = {'User-Agent': UA, 'Accept': 'application/json'}
    if method == 'GET':
        url = API + '?' + urllib.parse.urlencode(full)
        data = None
    else:
        url = API
        data = urllib.parse.urlencode(full).encode('utf-8')
        headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8'
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with opener.open(req, timeout=60) as response:
                result = json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 500, 502, 503, 504) and attempt + 1 < retries:
                delay = min(15 + attempt * 10, 60)
                print(f'HTTP {exc.code}; retrying in {delay}s', flush=True)
                time.sleep(delay)
                continue
            raise
        error = result.get('error')
        if error:
            code = error.get('code')
            if code in ('ratelimited', 'maxlag') and attempt + 1 < retries:
                delay = 35 if code == 'ratelimited' else min(5 + attempt * 5, 30)
                print(f'MediaWiki {code}; retrying in {delay}s', flush=True)
                time.sleep(delay)
                continue
            raise RuntimeError(f'MediaWiki API error: {error}')
        return result
    raise RuntimeError('MediaWiki API retries exhausted')


def login():
    if not USERNAME or not PASSWORD:
        raise RuntimeError('Missing WIKI_BOT_USERNAME or WIKI_BOT_PASSWORD repository secret')
    token = request({'action': 'query', 'meta': 'tokens', 'type': 'login'}, 'GET')['query']['tokens']['logintoken']
    result = request({'action': 'login', 'lgname': USERNAME, 'lgpassword': PASSWORD, 'lgtoken': token})
    if result.get('login', {}).get('result') != 'Success':
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
        'rvprop': 'ids|timestamp|user|comment|content|contentmodel', 'rvslots': 'main', 'curtimestamp': '1'
    }, 'GET')
    page = data.get('query', {}).get('pages', [{}])[0]
    rev = (page.get('revisions') or [{}])[0]
    slot = (rev.get('slots') or {}).get('main') or {}
    return {
        'title': title, 'missing': bool(page.get('missing')), 'pageid': page.get('pageid'),
        'revid': rev.get('revid'), 'timestamp': rev.get('timestamp'), 'user': rev.get('user'),
        'comment': rev.get('comment'), 'content': slot.get('content', ''),
        'contentmodel': slot.get('contentmodel') or rev.get('contentmodel'), 'curtimestamp': data.get('curtimestamp')
    }


def edit_page(csrf, title, text, before, summary, content_model=None):
    params = {
        'action': 'edit', 'title': title, 'text': text, 'token': csrf,
        'summary': summary, 'assert': 'user', 'watchlist': 'nochange',
        'starttimestamp': before.get('curtimestamp') or time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    }
    if not before.get('missing') and before.get('timestamp'):
        params['basetimestamp'] = before['timestamp']
    elif content_model:
        params['contentmodel'] = content_model
    result = request(params)
    edit = result.get('edit', {})
    if edit.get('result') != 'Success':
        raise RuntimeError(f'Edit failed for {title}: {edit}')
    return edit


def safe_file(title):
    return re.sub(r'[^A-Za-z0-9._-]+', '_', title)[:140] or 'page'


def main():
    if not (RENDERED / 'manifest.json').exists() or not FULL_BACKUP.exists():
        raise RuntimeError('Rendered source or fresh full backup is missing')
    manifest = json.loads((RENDERED / 'manifest.json').read_text(encoding='utf-8'))
    backup = json.loads(FULL_BACKUP.read_text(encoding='utf-8'))
    expected = {p['title']: (p.get('currentRevision') or {}).get('revid') for p in backup.get('pages', [])}

    backup_dir = OUT / 'pre-edit'
    post_dir = OUT / 'post-edit'
    backup_dir.mkdir(parents=True, exist_ok=True)
    post_dir.mkdir(parents=True, exist_ok=True)

    csrf, who = login()
    targets = sorted(manifest['pages'], key=lambda p: (0 if p.get('contentModel') == 'sanitized-css' else 2 if p['title'] == 'Main Page' else 1, p['title']))

    plan = []
    for item in targets:
        title = item['title']
        text = contained_file(RENDERED, item['filename'], 'Rendered wiki filename').read_text(encoding='utf-8')
        before = get_page(title)
        expected_revid = expected.get(title)
        if expected_revid is not None and before.get('revid') != expected_revid:
            raise RuntimeError(f'Race detected after full backup: {title} changed from rev {expected_revid} to {before.get("revid")}')
        if expected_revid is None and not before.get('missing'):
            # A workflow-owned migration may legitimately create/move the canonical target after the
            # full backup. Accept it only when the live source is already exactly the approved source.
            if before.get('content', '').rstrip() != text.rstrip():
                raise RuntimeError(f'Race detected after full backup: target page appeared with unexpected content: {title} rev {before.get("revid")}')
            print(f'POST-BACKUP EXACT MATCH {title} rev {before.get("revid")}', flush=True)
        if not before.get('missing') and item.get('contentModel') and before.get('contentmodel') not in (item.get('contentModel'), None):
            raise RuntimeError(f'Unexpected content model for {title}: {before.get("contentmodel")}')
        (backup_dir / f'{safe_file(title)}.json').write_text(json.dumps(before, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        plan.append((item, before, text))

    report = {
        'wikiUser': who.get('name'), 'fullBackupCreatedAtUtc': backup.get('createdAtUtc'),
        'startedAtUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'edits': []
    }
    for item, before, text in plan:
        title = item['title']
        if before.get('content', '').rstrip() == text.rstrip():
            report['edits'].append({'title': title, 'result': 'already-current', 'revid': before.get('revid')})
            print(f'ALREADY CURRENT {title}', flush=True)
            continue
        edit = edit_page(csrf, title, text, before, 'Update Enthusia player wiki documentation', item.get('contentModel'))
        after = get_page(title)
        (post_dir / f'{safe_file(title)}.json').write_text(json.dumps(after, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        if after.get('content', '').rstrip() != text.rstrip():
            raise RuntimeError(f'Readback verification failed for {title} at rev {after.get("revid")}')
        if item.get('contentModel') and after.get('contentmodel') != item.get('contentModel'):
            raise RuntimeError(f'Content model verification failed for {title}: {after.get("contentmodel")}')
        report['edits'].append({'title': title, 'result': 'published', 'oldrevid': edit.get('oldrevid'), 'newrevid': edit.get('newrevid')})
        print(f'PUBLISHED {title}: {edit.get("oldrevid")} -> {edit.get("newrevid")}', flush=True)
        time.sleep(EDIT_DELAY_SECONDS)

    report['finishedAtUtc'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    (OUT / 'publish-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"Publish complete: {len(report['edits'])} targets", flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'PUBLISH ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
