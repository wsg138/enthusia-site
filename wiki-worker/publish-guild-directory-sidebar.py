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
OUT = Path(os.environ.get('WIKI_GUILD_SIDEBAR_OUT', 'wiki-guild-sidebar-output'))
BACKUP = OUT / 'full-backup'
MANIFEST = BACKUP / 'manifest.json'
TITLE = 'MediaWiki:Sidebar'
TARGET_PAGE = 'Guild list'
UA = 'EnthusiaWikiGuildSidebar/1.0 (owner-authorized routing correction)'

OUT.mkdir(parents=True, exist_ok=True)
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def api(params, method='POST'):
    full = {'format': 'json', 'formatversion': '2', 'maxlag': '5', **params}
    headers = {'User-Agent': UA, 'Accept': 'application/json'}
    if method == 'GET':
        req = urllib.request.Request(API + '?' + urllib.parse.urlencode(full), headers=headers)
    else:
        req = urllib.request.Request(API, data=urllib.parse.urlencode(full).encode(), headers={**headers, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'})
    with opener.open(req, timeout=90) as response:
        data = json.load(response)
    if data.get('error'):
        raise RuntimeError(data['error'])
    return data


def login():
    if not USERNAME or not PASSWORD:
        raise RuntimeError('Missing wiki credentials')
    token = api({'action':'query','meta':'tokens','type':'login'}, 'GET')['query']['tokens']['logintoken']
    result = api({'action':'login','lgname':USERNAME,'lgpassword':PASSWORD,'lgtoken':token})
    if result.get('login',{}).get('result') != 'Success':
        raise RuntimeError(f'Login failed: {result}')
    who = api({'action':'query','meta':'userinfo','uiprop':'rights'}, 'GET')['query']['userinfo']
    if 'editinterface' not in set(who.get('rights') or []):
        raise RuntimeError('Missing editinterface right')
    csrf = api({'action':'query','meta':'tokens','type':'csrf'}, 'GET')['query']['tokens']['csrftoken']
    return who, csrf


def live_page(title):
    data = api({'action':'query','prop':'revisions|info','titles':title,'rvprop':'ids|timestamp|content','rvslots':'main','curtimestamp':'1'}, 'GET')
    p = data['query']['pages'][0]
    rev = (p.get('revisions') or [{}])[0]
    slot = (rev.get('slots') or {}).get('main') or {}
    return {'title':title,'revid':rev.get('revid'),'timestamp':rev.get('timestamp'),'content':slot.get('content',''),'curtimestamp':data.get('curtimestamp')}


def main():
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    pages = {p['title']: p for p in manifest.get('pages', [])}
    sidebar_rec = pages.get(TITLE)
    target_rec = pages.get(TARGET_PAGE)
    players_rec = pages.get('Players')
    if not sidebar_rec or not target_rec or not players_rec:
        raise RuntimeError('Required page missing from fresh full backup')
    sidebar_source = (BACKUP / sidebar_rec['backupFile']).read_text(encoding='utf-8')
    guild_source = (BACKUP / target_rec['backupFile']).read_text(encoding='utf-8')
    if '<dpl>' not in guild_source.lower() or 'category = Guilds' not in guild_source:
        raise RuntimeError('Guild list no longer looks like the guild directory')

    lines = sidebar_source.splitlines(keepends=True)
    guild_matches=[]
    players_matches=[]
    rx = re.compile(r'^(\s*\*\*\s*)([^|\r\n]+?)(\s*\|\s*)([^\r\n]+?)(\r?\n)?$')
    for i,line in enumerate(lines):
        m=rx.match(line)
        if not m: continue
        label=m.group(4).strip().casefold()
        if label=='guilds': guild_matches.append((i,m))
        if label=='players': players_matches.append((i,m))
    if len(guild_matches)!=1 or len(players_matches)!=1:
        raise RuntimeError('Sidebar labels are not unique')
    pi,pm=players_matches[0]
    if pm.group(2).strip()!='Players':
        raise RuntimeError(f'Players sidebar target changed unexpectedly: {pm.group(2).strip()}')
    gi,gm=guild_matches[0]
    before_target=gm.group(2).strip()
    ending=gm.group(5) or ''
    lines[gi]=f"{gm.group(1)}{TARGET_PAGE}{gm.group(3)}{gm.group(4)}{ending}"
    target=''.join(lines)
    before_lines=sidebar_source.splitlines(); after_lines=target.splitlines()
    changed=[(i,a,b) for i,(a,b) in enumerate(zip(before_lines,after_lines),1) if a!=b]
    if len(before_lines)!=len(after_lines) or len(changed)>1:
        raise RuntimeError(f'Unexpected sidebar diff: {changed!r}')
    if changed and not re.match(r'^\s*\*\*\s*Guild list\s*\|\s*Guilds\s*$', changed[0][2], re.I):
        raise RuntimeError(f'Unexpected replacement: {changed[0]!r}')

    (OUT/'sidebar-before.wiki').write_text(sidebar_source,encoding='utf-8')
    (OUT/'sidebar-target.wiki').write_text(target,encoding='utf-8')
    who,csrf=login()
    live=live_page(TITLE)
    expected=(sidebar_rec.get('currentRevision') or {}).get('revid')
    if live['revid']!=expected or live['content']!=sidebar_source:
        raise RuntimeError(f'Race detected: backup rev {expected}, live rev {live["revid"]}')
    if target==sidebar_source:
        edit={'result':'already-current','revid':live['revid']}
    else:
        e=api({'action':'edit','title':TITLE,'text':target,'token':csrf,'summary':'Point Guilds sidebar entry to community Guild list','assert':'user','watchlist':'nochange','starttimestamp':live['curtimestamp'],'basetimestamp':live['timestamp']}).get('edit') or {}
        if e.get('result')!='Success': raise RuntimeError(f'Edit failed: {e}')
        edit={'result':'published','oldrevid':e.get('oldrevid'),'newrevid':e.get('newrevid')}
    after=live_page(TITLE)
    if after['content']!=target:
        raise RuntimeError('Read-back mismatch')
    purge=api({'action':'purge','titles':'Main Page|Guild list|Players','forcelinkupdate':'1'})
    evidence={'authenticatedAs':who.get('name'),'backupCreatedAtUtc':manifest.get('createdAtUtc'),'sidebarBackupRevision':expected,'oldGuildTarget':before_target,'newGuildTarget':TARGET_PAGE,'changedLineCount':len(changed),'playersTargetPreserved':'Players','guildListRevision':(target_rec.get('currentRevision') or {}).get('revid'),'playersRevision':(players_rec.get('currentRevision') or {}).get('revid'),'edit':edit,'verifiedLiveRevision':after['revid'],'purgeResponsePresent':bool(purge.get('purge')),'finishedAtUtc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
    (OUT/'publish-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(evidence,indent=2))


if __name__=='__main__':
    try: main()
    except Exception as exc:
        print(f'GUILD SIDEBAR PUBLISH ERROR: {exc}',file=sys.stderr)
        sys.exit(1)
