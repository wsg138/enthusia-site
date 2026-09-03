#!/usr/bin/env python3
import hashlib
import json
import re
import sys
from pathlib import Path

OUT = Path('wiki-sidebar-routing-output')
BACKUP = OUT / 'full-backup'
MANIFEST = BACKUP / 'manifest.json'
TARGET_TITLE = 'MediaWiki:Sidebar'
LABEL_TARGETS = {'guilds': 'Guilds', 'players': 'Players'}


def sha256(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def load_backup():
    if not MANIFEST.exists():
        raise RuntimeError('Fresh full backup manifest is missing')
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    pages = {p['title']: p for p in manifest.get('pages', [])}
    return manifest, pages


def page_text(pages, title):
    rec = pages.get(title)
    if not rec:
        raise RuntimeError(f'Required live wiki page is missing from fresh backup: {title}')
    path = BACKUP / rec['backupFile']
    if not path.exists():
        raise RuntimeError(f'Backup source missing for {title}: {path}')
    return rec, path.read_text(encoding='utf-8')


def update_sidebar(existing):
    lines = existing.splitlines(keepends=True)
    matches = {label: [] for label in LABEL_TARGETS}
    pattern = re.compile(r'^(?P<prefix>\s*\*\*\s*)(?P<target>[^|\r\n]+?)(?P<sep>\s*\|\s*)(?P<label>[^\r\n]+?)(?P<ending>\r?\n)?$')

    for idx, line in enumerate(lines):
        m = pattern.match(line)
        if not m:
            continue
        label = m.group('label').strip().casefold()
        if label in matches:
            matches[label].append((idx, m))

    for label, found in matches.items():
        if len(found) != 1:
            raise RuntimeError(f'Expected exactly one sidebar item labelled {label!r}; found {len(found)}')

    changed = []
    for label, stable_target in LABEL_TARGETS.items():
        idx, m = matches[label][0]
        current_target = m.group('target').strip()
        ending = m.group('ending') or ''
        replacement = f"{m.group('prefix')}{stable_target}{m.group('sep')}{m.group('label')}{ending}"
        lines[idx] = replacement
        changed.append({
            'label': m.group('label').strip(),
            'lineNumber': idx + 1,
            'currentTarget': current_target,
            'stableTarget': stable_target,
            'needsChange': current_target != stable_target,
        })

    return ''.join(lines), changed


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest, pages = load_backup()
    sidebar_rec, sidebar = page_text(pages, TARGET_TITLE)

    stable_pages = {}
    for title in LABEL_TARGETS.values():
        rec, text = page_text(pages, title)
        stable_pages[title] = {
            'revid': (rec.get('currentRevision') or {}).get('revid'),
            'timestamp': (rec.get('currentRevision') or {}).get('timestamp'),
            'user': (rec.get('currentRevision') or {}).get('user'),
            'comment': (rec.get('currentRevision') or {}).get('comment'),
            'sha256': sha256(text),
            'isRedirect': bool(re.match(r'^\s*#redirect\s*\[\[', text, re.I)),
            'bytes': len(text.encode('utf-8')),
        }

    proposed, changes = update_sidebar(sidebar)
    sidebar_rev = sidebar_rec.get('currentRevision') or {}
    evidence = {
        'backupCreatedAtUtc': manifest.get('createdAtUtc'),
        'backupPageCount': len(manifest.get('pages', [])),
        'sidebar': {
            'revid': sidebar_rev.get('revid'),
            'timestamp': sidebar_rev.get('timestamp'),
            'user': sidebar_rev.get('user'),
            'comment': sidebar_rev.get('comment'),
            'beforeSha256': sha256(sidebar),
            'afterSha256': sha256(proposed),
            'changes': changes,
            'onlyGuildsPlayersTargetsChange': True,
        },
        'stablePages': stable_pages,
    }

    (OUT / 'sidebar-before.wiki').write_text(sidebar, encoding='utf-8')
    (OUT / 'sidebar-proposed.wiki').write_text(proposed, encoding='utf-8')
    (OUT / 'inspection.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')

    print(json.dumps(evidence, indent=2))
    if proposed == sidebar:
        print('SIDEBAR_ALREADY_STABLE')
    else:
        print('SIDEBAR_CHANGE_REQUIRED')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'SIDEBAR INSPECTION ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
