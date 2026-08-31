#!/usr/bin/env python3
import http.cookiejar
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from safety import project_output_path, wiki_api_url

API = wiki_api_url(os.environ.get('WIKI_API'))
USERNAME = os.environ.get('WIKI_BOT_USERNAME', '').strip()
PASSWORD = os.environ.get('WIKI_BOT_PASSWORD', '')
OUT = project_output_path(os.environ.get('WIKI_WORKER_OUT'))
DESIRED = OUT / 'rendered' / 'events.wiki'
UA = 'EnthusiaWikiPublisher/2.5 (owner-authorized title migration)'

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
            print(f"{err.get('code')} while migrating title; retrying in {wait}s")
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
    return api({'action': 'query', 'meta': 'tokens'}, 'GET')['query']['tokens']['csrftoken']


def page(title):
    result = api({'action': 'query', 'prop': 'revisions', 'titles': title, 'rvprop': 'ids|timestamp|user|comment|content', 'rvslots': 'main'}, 'GET')
    p = result['query']['pages'][0]
    rev = (p.get('revisions') or [{}])[0]
    content = ((rev.get('slots') or {}).get('main') or {}).get('content', '')
    return {'missing': bool(p.get('missing')), 'revid': rev.get('revid'), 'user': rev.get('user'), 'comment': rev.get('comment'), 'content': content}


def norm(text):
    return text.rstrip()


def main():
    if not DESIRED.exists():
        raise RuntimeError('Rendered Events source is missing')
    desired = norm(DESIRED.read_text(encoding='utf-8'))
    old = page('Server Events')
    new = page('Events')

    # This helper owns only the one-time title migration. If Events already exists,
    # content ownership/update safety has already been decided by the preceding
    # full-backup human-edit guard, and publish.py performs revision-safe updates.
    # Requiring the canonical page to equal the new desired source here would
    # incorrectly block every legitimate later Events content/renderer update.
    if not new['missing']:
        print(f'Events already canonical at rev {new["revid"]}; no title migration needed')
        return

    if old['missing']:
        print('Server Events is absent and Events is absent; publisher will create Events normally.')
        return

    if norm(old['content']) != desired:
        raise RuntimeError(f'Server Events differs from approved Events source at rev {old["revid"]}; refusing move')

    csrf = login()
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


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'EVENTS TITLE MIGRATION ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
