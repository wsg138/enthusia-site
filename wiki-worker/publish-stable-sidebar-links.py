#!/usr/bin/env python3
import hashlib
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
OUT = Path(os.environ.get('WIKI_SIDEBAR_OUT', 'wiki-stable-sidebar-output'))
BACKUP = OUT / 'full-backup'
MANIFEST = BACKUP / 'manifest.json'
TITLE = 'MediaWiki:Sidebar'
LABEL_TARGETS = {'guilds': 'Guilds', 'players': 'Players'}
UA = 'EnthusiaWikiStableSidebar/1.0 (owner-authorized interface routing fix)'

OUT.mkdir(parents=True, exist_ok=True)
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def sha256(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def api(params, method='POST', retries=6):
    full = {'format': 'json', 'formatversion': '2', 'maxlag': '5', **params}
    headers = {'User-Agent': UA, 'Accept': 'application/json'}
    if method == 'GET':
        req = urllib.request.Request(API + '?' + urllib.parse.urlencode(full), headers=headers)
    else:
        req = urllib.request.Request(
            API,
            data=urllib.parse.urlencode(full).encode('utf-8'),
            headers={**headers, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'},
        )
    for attempt in range(retries):
        try:
            with opener.open(req, timeout=90) as response:
                result = json.load(response)
        except Exception:
            if attempt + 1 < retries:
                time.sleep(2 + attempt * 2)
                continue
            raise
        error = result.get('error')
        if error:
            if error.get('code') in {'maxlag', 'ratelimited'} and attempt + 1 < retries:
                time.sleep(5 + attempt * 5)
                continue
            raise RuntimeError(f'MediaWiki API error: {error}')
        return result
    raise RuntimeError('MediaWiki API retries exhausted')


def login():
    if not USERNAME or not PASSWORD:
        raise RuntimeError('Missing WIKI_BOT_USERNAME or WIKI_BOT_PASSWORD')
    login_token = api({'action': 'query', 'meta': 'tokens', 'type': 'login'}, 'GET')['query']['tokens']['logintoken']
    result = api({'action': 'login', 'lgname': USERNAME, 'lgpassword': PASSWORD, 'lgtoken': login_token})
    if result.get('login', {}).get('result') != 'Success':
        raise RuntimeError(f'Wiki login failed: {result.get("login")}')
    who = api({'action': 'query', 'meta': 'userinfo', 'uiprop': 'rights'}, 'GET')['query']['userinfo']
    if who.get('anon'):
        raise RuntimeError('Wiki session is anonymous after login')
    rights = set(who.get('rights') or [])
    if 'editinterface' not in rights:
        raise RuntimeError('Authenticated bot account does not have editinterface permission')
    csrf = api({'action': 'query', 'meta': 'tokens', 'type': 'csrf'}, 'GET')['query']['tokens']['csrftoken']
    return who, csrf


def live_page(title):
    data = api({
        'action': 'query', 'prop': 'revisions|info', 'titles': title,
        'rvprop': 'ids|timestamp|user|comment|content|contentmodel',
        'rvslots': 'main', 'curtimestamp': '1',
    }, 'GET')
    page = data.get('query', {}).get('pages', [{}])[0]
    rev = (page.get('revisions') or [{}])[0]
    slot = (rev.get('slots') or {}).get('main') or {}
    return {
        'title': title,
        'missing': bool(page.get('missing')),
        'revid': rev.get('revid'),
        'timestamp': rev.get('timestamp'),
        'user': rev.get('user'),
        'comment': rev.get('comment'),
        'content': slot.get('content', ''),
        'contentmodel': slot.get('contentmodel') or rev.get('contentmodel'),
        'curtimestamp': data.get('curtimestamp'),
    }


def load_backup():
    if not MANIFEST.exists():
        raise RuntimeError('Fresh full backup manifest missing')
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    pages = {p['title']: p for p in manifest.get('pages', [])}
    return manifest, pages


def backup_text(pages, title):
    rec = pages.get(title)
    if not rec:
        raise RuntimeError(f'Required page missing from fresh backup: {title}')
    path = BACKUP / rec['backupFile']
    if not path.exists():
        raise RuntimeError(f'Backup source missing for {title}')
    return rec, path.read_text(encoding='utf-8')


def transform(existing):
    lines = existing.splitlines(keepends=True)
    pattern = re.compile(r'^(?P<prefix>\s*\*\*\s*)(?P<target>[^|\r\n]+?)(?P<sep>\s*\|\s*)(?P<label>[^\r\n]+?)(?P<ending>\r?\n)?$')
    matches = {label: [] for label in LABEL_TARGETS}
    for idx, line in enumerate(lines):
        m = pattern.match(line)
        if m:
            key = m.group('label').strip().casefold()
            if key in matches:
                matches[key].append((idx, m))

    for label, found in matches.items():
        if len(found) != 1:
            raise RuntimeError(f'Expected exactly one sidebar item labelled {label!r}; found {len(found)}')

    changes = []
    for label, stable_target in LABEL_TARGETS.items():
        idx, m = matches[label][0]
        old_target = m.group('target').strip()
        ending = m.group('ending') or ''
        replacement = f"{m.group('prefix')}{stable_target}{m.group('sep')}{m.group('label')}{ending}"
        lines[idx] = replacement
        changes.append({
            'label': m.group('label').strip(),
            'lineNumber': idx + 1,
            'oldTarget': old_target,
            'newTarget': stable_target,
            'changed': old_target != stable_target,
        })

    proposed = ''.join(lines)
    before_lines = existing.splitlines()
    after_lines = proposed.splitlines()
    if len(before_lines) != len(after_lines):
        raise RuntimeError('Sidebar transformation changed line count')
    diff_lines = [(i, a, b) for i, (a, b) in enumerate(zip(before_lines, after_lines), 1) if a != b]
    if len(diff_lines) > 2:
        raise RuntimeError(f'Sidebar transformation touched more than two lines: {diff_lines!r}')
    allowed = {
        'guilds': re.compile(r'^\s*\*\*\s*Guilds\s*\|\s*Guilds\s*$', re.I),
        'players': re.compile(r'^\s*\*\*\s*Players\s*\|\s*Players\s*$', re.I),
    }
    for line_no, _, after in diff_lines:
        if not any(rx.match(after) for rx in allowed.values()):
            raise RuntimeError(f'Unexpected sidebar replacement at line {line_no}: {after!r}')
    return proposed, changes, diff_lines


def assert_backup_matches_live(live, rec, backup_source):
    expected_rev = (rec.get('currentRevision') or {}).get('revid')
    if live.get('missing'):
        raise RuntimeError(f'{live["title"]} disappeared after backup')
    if live.get('revid') != expected_rev:
        raise RuntimeError(f'Race detected for {live["title"]}: backup rev {expected_rev}, live rev {live.get("revid")}')
    if live.get('content') != backup_source:
        raise RuntimeError(f'Exact-source mismatch for {live["title"]} despite matching backup revision')


def edit(csrf, before, target):
    if before['content'] == target:
        return {'result': 'already-current', 'revid': before['revid']}
    result = api({
        'action': 'edit', 'title': TITLE, 'text': target, 'token': csrf,
        'summary': 'Point Guilds and Players sidebar links to stable community-editable pages',
        'assert': 'user', 'watchlist': 'nochange',
        'starttimestamp': before['curtimestamp'], 'basetimestamp': before['timestamp'],
    }).get('edit') or {}
    if result.get('result') != 'Success':
        raise RuntimeError(f'Edit failed: {result}')
    return {
        'result': 'published',
        'oldrevid': result.get('oldrevid'),
        'newrevid': result.get('newrevid'),
    }


def main():
    manifest, pages = load_backup()

    sidebar_rec, sidebar_backup = backup_text(pages, TITLE)
    stable = {}
    for page_title in LABEL_TARGETS.values():
        rec, text = backup_text(pages, page_title)
        stable[page_title] = {
            'revid': (rec.get('currentRevision') or {}).get('revid'),
            'sha256': sha256(text),
            'bytes': len(text.encode('utf-8')),
        }

    target, changes, diff_lines = transform(sidebar_backup)
    (OUT / 'sidebar-before.wiki').write_text(sidebar_backup, encoding='utf-8')
    (OUT / 'sidebar-target.wiki').write_text(target, encoding='utf-8')

    who, csrf = login()
    live = live_page(TITLE)
    assert_backup_matches_live(live, sidebar_rec, sidebar_backup)

    result = edit(csrf, live, target)
    after = live_page(TITLE)
    if after.get('content') != target:
        raise RuntimeError(f'Read-back verification failed at rev {after.get("revid")}')

    purge = api({'action': 'purge', 'titles': 'Main Page|Guilds|Players', 'forcelinkupdate': '1'})
    evidence = {
        'authenticatedAs': who.get('name'),
        'backupCreatedAtUtc': manifest.get('createdAtUtc'),
        'backupPageCount': len(manifest.get('pages', [])),
        'sidebarBackupRevision': (sidebar_rec.get('currentRevision') or {}).get('revid'),
        'beforeSha256': sha256(sidebar_backup),
        'targetSha256': sha256(target),
        'afterSha256': sha256(after.get('content', '')),
        'changes': changes,
        'changedLineCount': len(diff_lines),
        'stablePagesPreserved': stable,
        'edit': result,
        'verifiedLiveRevision': after.get('revid'),
        'purgeResponsePresent': bool(purge.get('purge')),
        'finishedAtUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }
    (OUT / 'publish-evidence.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(evidence, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'STABLE SIDEBAR PUBLISH ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
