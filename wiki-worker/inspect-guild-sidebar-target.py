#!/usr/bin/env python3
import json
from pathlib import Path

OUT = Path('wiki-guild-target-output')
BACKUP = OUT / 'full-backup'
MANIFEST = BACKUP / 'manifest.json'
TITLES = ['MediaWiki:Sidebar', 'Guilds', 'Guild list', 'Noteable Guilds']


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    pages = {p['title']: p for p in manifest.get('pages', [])}
    result = {'backupCreatedAtUtc': manifest.get('createdAtUtc'), 'pages': {}}
    for title in TITLES:
        rec = pages.get(title)
        if not rec:
            result['pages'][title] = {'missing': True}
            continue
        text = (BACKUP / rec['backupFile']).read_text(encoding='utf-8')
        result['pages'][title] = {
            'missing': False,
            'revid': (rec.get('currentRevision') or {}).get('revid'),
            'timestamp': (rec.get('currentRevision') or {}).get('timestamp'),
            'user': (rec.get('currentRevision') or {}).get('user'),
            'comment': (rec.get('currentRevision') or {}).get('comment'),
            'bytes': len(text.encode('utf-8')),
            'source': text,
        }
    (OUT / 'guild-target-inspection.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
