#!/usr/bin/env python3
import http.cookiejar
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = os.environ.get('WIKI_API', 'https://enthusia.miraheze.org/w/api.php')
USERNAME = os.environ.get('WIKI_BOT_USERNAME', '').strip()
PASSWORD = os.environ.get('WIKI_BOT_PASSWORD', '')
OUT = Path(os.environ.get('WIKI_WORKER_OUT', 'wiki-worker-output'))
DESIRED = OUT / 'rendered' / 'events.wiki'
PRIVATE_STAGE_MARKER = Path('wiki-private-stage-enable.txt')
PRIVATE_STAGE_COMMENT = 'Private visual staging for Enthusia wiki redesign'
PRIVATE_STAGE_USER = 'P2wn'
PRIVATE_STAGE_TARGETS = [
    ('User:P2wn/common.css', Path('wiki-worker/private-stage.css'), 'css'),
    ('User:P2wn/common.js', Path('wiki-worker/private-stage.js'), 'javascript'),
]
UA = 'EnthusiaWikiPublisher/2.6 (owner-authorized title migration and private visual staging)'

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def api(params, method='POST', retries=6):
    full = {'format': 'json', 'formatversion': '2', 'maxlag': '5', **params}
    for attempt in range(retries):
        headers = {'User-Agent': UA, 'Accept': 'application/json'}
        if method == 'GET':
            req = urllib.request.Request(API + '?' + urllib.parse.urlencode(full), headers=headers)
        else:
            headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8'
            req = urllib.request.Request(API, data=urllib.parse.urlencode(full).encode(), headers=headers)
        with opener.open(req, timeout=60) as response:
            result = json.loads(response.read().decode())
        err = result.get('error')
        if err and err.get('code') in {'ratelimited', 'maxlag'} and attempt + 1 < retries:
            wait = 20 + attempt * 15
            print(f"{err.get('code')} while publishing helper; retrying in {wait}s")
            time.sleep(wait)
            continue
        if err:
            raise RuntimeError(f'MediaWiki API error: {err}')
        return result
    raise RuntimeError('MediaWiki request retries exhausted')


def login():
    if not USERNAME or not PASSWORD:
        raise RuntimeError('Missing wiki credentials')
    token = api({'action': 'query', 'meta': 'tokens', 'type': 'login'}, 'GET')['query']['tokens']['logintoken']
    result = api({'action': 'login', 'lgname': USERNAME, 'lgpassword': PASSWORD, 'lgtoken': token})
    if result.get('login', {}).get('result') != 'Success':
        raise RuntimeError(f'Wiki login failed: {result.get("login")}')
    csrf = api({'action': 'query', 'meta': 'tokens'}, 'GET')['query']['tokens']['csrftoken']
    who = api({'action': 'query', 'meta': 'userinfo', 'uiprop': 'rights|options'}, 'GET')['query']['userinfo']
    if who.get('anon'):
        raise RuntimeError('Wiki session is anonymous after login')
    return csrf, who


def page(title):
    result = api({
        'action': 'query', 'prop': 'revisions|info', 'titles': title,
        'rvprop': 'ids|timestamp|user|comment|content|contentmodel', 'rvslots': 'main', 'curtimestamp': '1'
    }, 'GET')
    p = result['query']['pages'][0]
    rev = (p.get('revisions') or [{}])[0]
    slot = (rev.get('slots') or {}).get('main') or {}
    content = slot.get('content', '')
    return {
        'missing': bool(p.get('missing')), 'revid': rev.get('revid'), 'timestamp': rev.get('timestamp'),
        'user': rev.get('user'), 'comment': rev.get('comment'), 'content': content,
        'contentmodel': slot.get('contentmodel') or rev.get('contentmodel'), 'curtimestamp': result.get('curtimestamp')
    }


def norm(text):
    return text.rstrip()


def edit_page(csrf, title, text, before, content_model):
    params = {
        'action': 'edit', 'title': title, 'text': text, 'token': csrf,
        'summary': PRIVATE_STAGE_COMMENT, 'assert': 'user', 'watchlist': 'nochange',
        'starttimestamp': before.get('curtimestamp') or time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    }
    if not before.get('missing') and before.get('timestamp'):
        params['basetimestamp'] = before['timestamp']
    else:
        params['contentmodel'] = content_model
    result = api(params)
    edit = result.get('edit') or {}
    if edit.get('result') != 'Success':
        raise RuntimeError(f'Private stage edit failed for {title}: {edit}')
    return edit


def private_stage(csrf, who):
    if not PRIVATE_STAGE_MARKER.exists():
        return
    if who.get('name') != PRIVATE_STAGE_USER:
        raise RuntimeError(f'Private stage requires authenticated user {PRIVATE_STAGE_USER}; got {who.get("name")}')

    selected_skin = (who.get('options') or {}).get('skin') or '(default/unknown)'
    print(f'PRIVATE STAGE authenticated as {who.get("name")}; selected skin={selected_skin}')

    backup_path = OUT / 'full-backup' / 'manifest.json'
    if not backup_path.exists():
        raise RuntimeError('Fresh full backup manifest is required before private staging')
    backup = json.loads(backup_path.read_text(encoding='utf-8'))
    bmap = {p['title']: p for p in backup.get('pages', [])}

    report = {
        'wikiUser': who.get('name'), 'selectedSkin': selected_skin,
        'backupCreatedAtUtc': backup.get('createdAtUtc'), 'targets': []
    }

    for title, source_path, content_model in PRIVATE_STAGE_TARGETS:
        if not source_path.exists() or not source_path.read_text(encoding='utf-8').strip():
            raise RuntimeError(f'Private stage source missing or empty: {source_path}')
        desired = source_path.read_text(encoding='utf-8').rstrip() + '\n'
        before = page(title)
        backed = bmap.get(title)
        expected_revid = (backed.get('currentRevision') or {}).get('revid') if backed else None

        if expected_revid is not None and before.get('revid') != expected_revid:
            raise RuntimeError(f'Private stage race: {title} changed after backup from {expected_revid} to {before.get("revid")}')
        if expected_revid is None and not before.get('missing') and norm(before.get('content', '')) != norm(desired):
            raise RuntimeError(f'Private stage race: {title} appeared after backup with unexpected content at rev {before.get("revid")}')
        if not before.get('missing') and norm(before.get('content', '')) != norm(desired) and before.get('comment') != PRIVATE_STAGE_COMMENT:
            raise RuntimeError(f'Private stage refuses to overwrite pre-existing user content on {title} rev {before.get("revid")}')
        if not before.get('missing') and before.get('contentmodel') not in (content_model, None):
            raise RuntimeError(f'Unexpected content model for {title}: {before.get("contentmodel")}')

        if norm(before.get('content', '')) == norm(desired):
            print(f'PRIVATE STAGE ALREADY CURRENT {title} rev {before.get("revid")}')
            report['targets'].append({'title': title, 'result': 'already-current', 'revid': before.get('revid')})
            continue

        edit = edit_page(csrf, title, desired, before, content_model)
        after = page(title)
        if norm(after.get('content', '')) != norm(desired):
            raise RuntimeError(f'Private stage readback verification failed for {title} rev {after.get("revid")}')
        if after.get('contentmodel') != content_model:
            raise RuntimeError(f'Private stage content model mismatch for {title}: {after.get("contentmodel")}')
        print(f'PRIVATE STAGE PUBLISHED {title}: {edit.get("oldrevid")} -> {edit.get("newrevid")}')
        report['targets'].append({
            'title': title, 'result': 'published', 'oldrevid': edit.get('oldrevid'), 'newrevid': edit.get('newrevid')
        })
        time.sleep(8.5)

    (OUT / 'private-stage-report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('PRIVATE STAGE verified by exact API readback')


def main():
    if not DESIRED.exists():
        raise RuntimeError('Rendered Events source is missing')
    desired = norm(DESIRED.read_text(encoding='utf-8'))
    old = page('Server Events')
    new = page('Events')

    csrf = None
    who = None

    # This helper owns only the one-time title migration. If Events already exists,
    # content ownership/update safety has already been decided by the preceding
    # full-backup human-edit guard, and publish.py performs revision-safe updates.
    if not new['missing']:
        print(f'Events already canonical at rev {new["revid"]}; no title migration needed')
    elif old['missing']:
        print('Server Events is absent and Events is absent; publisher will create Events normally.')
    else:
        if norm(old['content']) != desired:
            raise RuntimeError(f'Server Events differs from approved Events source at rev {old["revid"]}; refusing move')
        csrf, who = login()
        result = api({
            'action': 'move', 'from': 'Server Events', 'to': 'Events', 'token': csrf,
            'reason': 'Use the canonical Events page title', 'movetalk': '1', 'watchlist': 'nochange', 'assert': 'user'
        })
        moved = result.get('move') or {}
        if moved.get('to') != 'Events':
            raise RuntimeError(f'Unexpected move result: {result}')
        check = page('Events')
        if check['missing'] or norm(check['content']) != desired:
            raise RuntimeError('Events move readback verification failed')
        redirect = page('Server Events')
        if redirect['missing'] or '#REDIRECT' not in redirect['content'].upper():
            raise RuntimeError('Server Events redirect verification failed')
        print(f'MOVED Server Events -> Events; Events rev {check["revid"]}; redirect preserved')

    if PRIVATE_STAGE_MARKER.exists():
        if csrf is None or who is None:
            csrf, who = login()
        private_stage(csrf, who)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'EVENTS TITLE MIGRATION ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
