#!/usr/bin/env python3
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = os.environ.get('WIKI_API', 'https://enthusia.miraheze.org/w/api.php')
OUT = Path(os.environ.get('WIKI_WORKER_OUT', 'wiki-worker-output'))
RENDERED = OUT / 'rendered'
UA = 'EnthusiaWikiValidator/2.2 (read-only parser validation)'
UNSUPPORTED_TAGS = ('details', 'summary', 'thead', 'tbody')


def api(params, retries=4):
    full = {'format': 'json', 'formatversion': '2', 'maxlag': '5', **params}
    body = urllib.parse.urlencode(full).encode('utf-8')
    headers = {'User-Agent': UA, 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'}
    for attempt in range(retries):
        try:
            req = urllib.request.Request(API, data=body, headers=headers)
            with urllib.request.urlopen(req, timeout=60) as response:
                result = json.loads(response.read().decode('utf-8'))
            error = result.get('error')
            if error and error.get('code') == 'maxlag' and attempt + 1 < retries:
                time.sleep(2 + attempt * 2)
                continue
            if error:
                raise RuntimeError(f'MediaWiki parser error: {error}')
            return result
        except (urllib.error.URLError, TimeoutError) as exc:
            if attempt + 1 < retries:
                time.sleep(2 + attempt * 2)
                continue
            raise RuntimeError(f'Unable to reach Miraheze parser: {exc}') from exc


def escaped_unsupported_tags(parsed_html):
    found = []
    for tag in UNSUPPORTED_TAGS:
        if re.search(rf'&lt;/?{tag}\b', parsed_html, re.IGNORECASE):
            found.append(tag)
    return found


def main():
    manifest_path = RENDERED / 'manifest.json'
    if not manifest_path.exists():
        raise RuntimeError('Rendered manifest missing')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))

    site = api({'action': 'query', 'meta': 'siteinfo', 'siprop': 'extensions'})
    extension_names = {e.get('name') for e in site.get('query', {}).get('extensions', [])}
    if 'TemplateStyles' not in extension_names:
        raise RuntimeError('TemplateStyles is not enabled on this Miraheze wiki; refusing to publish unstyled v2 pages')
    print('TemplateStyles extension is enabled.')

    report = {'templateStylesEnabled': True, 'validated': [], 'warnings': []}
    failures = []
    for item in manifest.get('pages', []):
        if item.get('contentModel') == 'sanitized-css':
            continue
        title = item['title']
        text = (RENDERED / item['filename']).read_text(encoding='utf-8')
        try:
            parsed = api({
                'action': 'parse', 'title': title, 'text': text, 'contentmodel': 'wikitext',
                'prop': 'text|wikitext|categories|links|templates|modules|jsconfigvars',
                'disablelimitreport': '1', 'disableeditsection': '1'
            })
            warnings = parsed.get('warnings') or {}
            if warnings:
                report['warnings'].append({'title': title, 'warnings': warnings})
            parsed_html = parsed.get('parse', {}).get('text') or ''
            escaped = escaped_unsupported_tags(parsed_html)
            if escaped:
                raise RuntimeError(f'MediaWiki escaped unsupported HTML tag(s): {", ".join(escaped)}')
            report['validated'].append({'title': title, 'ok': True})
            print(f'PARSE OK {title}')
        except Exception as exc:
            failures.append({'title': title, 'error': str(exc)})
            print(f'PARSE FAIL {title}: {exc}', file=sys.stderr)

    report['failures'] = failures
    report['ok'] = not failures
    (OUT / 'parse-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if failures:
        raise RuntimeError(f'{len(failures)} rendered pages failed MediaWiki parse validation')
    print(f"Validated {len(report['validated'])} rendered pages with Miraheze parser.")


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'VALIDATION ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
