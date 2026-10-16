"""Offline public projection from verified SQLite backups; no network or game operations."""
import argparse, base64, contextlib, datetime as dt, hashlib, json, pathlib, shutil, sqlite3, tempfile, uuid
import yaml

DYES = set('WHITE ORANGE MAGENTA LIGHT_BLUE YELLOW LIME PINK GRAY LIGHT_GRAY CYAN PURPLE BLUE BROWN GREEN RED BLACK'.split())
VERBS = dict(KILL_PLAYERS='Kill', KILL_MOBS='Kill', HARVEST_CROPS='Harvest', MINE_BLOCKS='Mine', PLACE_BLOCKS='Place', CRAFT_ITEMS='Craft', SMELT_ITEMS='Smelt', FISH='Catch', ENCHANT_ITEMS='Enchant', DEPOSIT_BANK='Deposit', WIN_WARS='Win')
ICONS = dict(zip(VERBS, ['iron_sword','iron_sword','iron_hoe','iron_pickaxe','bricks','crafting_table','furnace','fishing_rod','enchanting_table','gold_ingot','nether_star']))
def identity(value): return str(uuid.UUID(value))
def iso(value): return dt.datetime.fromtimestamp(value / 1000, dt.timezone.utc).isoformat()
def token(value): return ' '.join(part.capitalize() for part in value.lower().replace('-', '_').split('_') if part)
def plural(label):
    head, sep, word = label.rpartition(' ')
    if not sep: word = label; head = ''
    lower = word.lower()
    if lower in ('sheep','fish') or lower.endswith('s'): result = word
    elif lower.endswith(('ch','sh','x','z')): result = word + 'es'
    elif lower.endswith('y') and len(word)>1 and word[-2].lower() not in 'aeiou': result = word[:-1] + 'ies'
    else: result = word + 's'
    return (head + ' ' if head else '') + result
def integer(value, maximum=2147483647):
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= maximum: raise ValueError('Invalid integer')
    return value
def decode(value): return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4)).decode('utf-8')
def stamp(value):
    date = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if date.tzinfo is None or date.timestamp() > dt.datetime.now(dt.timezone.utc).timestamp() + 60: raise ValueError('Invalid backup capture date')
    return date
def digest(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()

@contextlib.contextmanager
def database(path):
    # Never open an active production database. WAL recovery happens on a temporary local copy.
    with tempfile.TemporaryDirectory(prefix='enthusia-public-export-') as tmp:
        if path.with_name(path.name + '-wal').exists() and path.with_name(path.name + '-wal').stat().st_size:
            copy = pathlib.Path(tmp) / path.name
            shutil.copyfile(path, copy)
            shutil.copyfile(path.with_name(path.name + '-wal'), copy.with_name(copy.name + '-wal'))
            connection = sqlite3.connect(copy.as_uri() + '?mode=ro', uri=True)
        else:
            connection = sqlite3.connect(path.as_uri() + '?mode=ro&immutable=1', uri=True)
        connection.row_factory = sqlite3.Row
        try:
            connection.execute('PRAGMA query_only=ON')
            if connection.execute('PRAGMA quick_check').fetchone()[0] != 'ok': raise ValueError('SQLite integrity check failed')
            connection.execute('BEGIN')
            yield connection
        finally: connection.close()

def banners(db):
    result = {}
    for row in db.execute('SELECT guild_id, base_color, patterns FROM guild_banners WHERE is_active=1'):
        key = identity(row['guild_id'])
        if key in result: raise ValueError('Multiple active banners; resolve the backup ambiguity')
        if row['base_color'] not in DYES: raise ValueError('Invalid banner color')
        patterns = []
        for value in filter(None, row['patterns'].split('|')):
            kind, color = value.split(':', 1)
            if color not in DYES or not kind.replace('_', '').isalpha() or kind != kind.upper(): raise ValueError('Invalid banner pattern')
            patterns.append(dict(type=kind, color=color))
        if len(patterns) > 20: raise ValueError('Too many banner patterns')
        result[key] = dict(baseColor=row['base_color'], patterns=patterns)
    return result

def condition(kind, value):
    if kind in ('X_WITHIN', 'Z_WITHIN'):
        center, radius = value.split(':', 1); return f'within {radius} blocks of {kind[0]}={center}'
    if kind in ('ABOVE_Y', 'BELOW_Y'): return f'{kind.split("_")[0].lower()} Y={value}'
    prefixes = dict(IN_DIMENSION='in', IN_BIOME='in', WITH_TOOL='using', WITHOUT_TOOL='without', USING_TRANSPORT='using')
    if kind == 'WITHOUT_ELYTRA': return 'without Elytra'
    if kind not in prefixes: raise ValueError('Unsupported quest condition')
    return prefixes[kind] + ' ' + token(value)

def objective(row, winner_xp):
    action = row['action']; verb = VERBS[action]; target = row['target_id'].split('/')[-1].split(':')[-1]
    count = integer(row['target_count'], 9223372036854775807)
    if count == 0: raise ValueError('Zero quest target')
    name = verb + ' ' + token(target)
    description = f'{verb} {count:,} {token(target)}'
    if count != 1 and action in ('CRAFT_ITEMS','SMELT_ITEMS','ENCHANT_ITEMS','KILL_MOBS'):
        description = f'{verb} {count:,} {plural(token(target))}'
    if action == 'FISH' and target.lower() == 'any': name = 'Catch Any Fish'; description = f'Catch {count:,} fish'
    if action == 'DEPOSIT_BANK': name = 'Deposit Gold Ore'; description = f'Deposit {count:,} Gold Ore to the Guild Bank'
    if action == 'WIN_WARS': name = 'Win Wars'; description = f'Win {count:,} ' + ('war' if count == 1 else 'wars')
    if action == 'KILL_PLAYERS': name = 'Kill Players'; description = f'Kill {count:,} ' + ('player' if count == 1 else 'players')
    conditions = []
    if row['conditions']:
        for entry in row['conditions'].split(','):
            kind, encoded = entry.split(':', 1); conditions.append(condition(kind, decode(encoded)))
    elif row['condition_type']: conditions.append(condition(row['condition_type'], row['condition_value'] or ''))
    if conditions: description += ' ' + ' and '.join(conditions)
    rewards = []
    for entry in filter(None, row['item_rewards'].split(',')):
        amount, encoded = entry.split(':', 1); item = decode(encoded)
        rewards.append(dict(item=item, name=token(item), amount=integer(int(amount))))
    payouts = []
    for entry in filter(None, row['leaderboard_payouts'].split(',')):
        rank, xp = map(int, entry.split(':', 1)); payouts.append(dict(rank=integer(rank, 200), experience=integer(xp)))
    if not payouts and winner_xp > 0: payouts = [dict(rank=1, experience=winner_xp)]
    return dict(id=row['quest_id'], name=name, description=description, action=action, tier=row['tier'], icon=ICONS[action],
        targetCount=str(count), experienceReward=integer(row['experience_reward']), conditions=conditions,
        provenance=row['provenance_policy'], itemRewards=rewards, leaderboard=bool(row['leaderboard']),
        payouts=sorted(payouts, key=lambda p:p['rank']), standings=[])

def guild_export(db, profiles, captured, progression):
    designs = banners(db)
    rows = list(db.execute('SELECT id, name, level FROM guilds ORDER BY id LIMIT 1001'))
    if len(rows) > 1000: raise ValueError('Guild limit exceeded')
    guilds = {identity(row['id']):dict(id=identity(row['id']), name=row['name'], level=integer(row['level']), banner=designs.get(identity(row['id']))) for row in rows}
    associations = {p['id']:[] for p in profiles}
    # Counts are public; never export ranks, homes, rosters, claim actors or submitters.
    for row in db.execute('SELECT player_id, guild_id FROM members'):
        player, guild = identity(row['player_id']), identity(row['guild_id'])
        if player in associations and guild in guilds: associations[player].append(guilds[guild])
    if any(len(values) > 20 for values in associations.values()): raise ValueError('Player guild limit exceeded')
    directory = []
    for guild in guilds.values():
        count = db.execute('SELECT COUNT(*) FROM members WHERE guild_id=?', (guild['id'],)).fetchone()[0]
        directory.append(dict(guild, members=count))
    bundle = dict(playerGuilds=dict(generatedAt=captured, items=[dict(id=key, guildMemberships=values) for key, values in associations.items()]),
                  guilds=dict(generatedAt=captured, items=directory))
    weeks = list(db.execute('SELECT week_id, starts_at, ends_at FROM weekly_quest_sets WHERE active=1 LIMIT 2'))
    if len(weeks) > 1: raise ValueError('Multiple active quest sets')
    snapshot = dict(kind='guildquests', schemaVersion=1, generatedAt=captured, currentWeekId=None, limited=True, items=[])
    if weeks:
        week = weeks[0]; config = progression['quests']
        bonus, winner = integer(config['full_set_bonus_xp']), integer(config['leaderboard_winner_xp'])
        definitions = list(db.execute('SELECT * FROM weekly_quest_definitions WHERE week_id=? ORDER BY quest_order, quest_id LIMIT 31', (week['week_id'],)))
        if len(definitions) > 30: raise ValueError('Quest definition limit exceeded')
        if definitions:
            quests, used = [], set()
            for row in definitions:
                quest = objective(row, winner)
                progress = db.execute('SELECT p.guild_id,p.current_count,p.claimed,p.reward_delivered FROM guild_quest_progress p JOIN guilds g ON g.id=p.guild_id WHERE p.week_id=? AND p.quest_id=? ORDER BY p.current_count DESC,p.guild_id ASC LIMIT 50', (week['week_id'],row['quest_id']))
                for rank, value in enumerate(progress, 1):
                    key = identity(value['guild_id']); used.add(key)
                    quest['standings'].append(dict(guildId=key, rank=rank, count=str(integer(value['current_count'],9223372036854775807)), claimed=bool(value['claimed']), rewardDelivered=bool(value['reward_delivered'])))
                quests.append(quest)
            if len(used) > 200: raise ValueError('Quest guild limit exceeded')
            snapshot['currentWeekId'] = week['week_id']
            snapshot['items'] = [dict(id=week['week_id'], startsAt=iso(week['starts_at']), endsAt=iso(week['ends_at']), fullSetBonusExperience=bonus,
                guilds=[dict(id=key,name=guilds[key]['name'],banner=guilds[key]['banner']) for key in sorted(used)],quests=quests)]
    bundle['guildquests'] = snapshot
    return bundle

def achievement_export(db, profiles, catalogue, captured):
    if catalogue.get('scope') != 'registered_renderer_projection' or not catalogue.get('items'): raise ValueError('A nonempty registered renderer catalogue is required')
    definitions = {}
    for row in catalogue['items']:
        namespace, key = row['id'].split(':', 1)
        if key == 'root' or row.get('maximumProgress') != 100: raise ValueError('Unsupported renderer catalogue node')
        if (namespace,key) in definitions: raise ValueError('Duplicate catalogue identity')
        definitions[namespace,key] = row['name']
    if len(definitions) > 1000: raise ValueError('Catalogue limit exceeded')
    items = []
    for profile in profiles:
        team = db.execute('SELECT TeamID FROM Players WHERE lower(UUID)=?', (profile['id'],)).fetchone()
        if not team or db.execute('SELECT COUNT(*) FROM Players WHERE TeamID=?',(team[0],)).fetchone()[0] != 1: continue
        completed = []
        for row in db.execute('SELECT Namespace,Key,Progression FROM Advancements WHERE TeamID=?',(team[0],)):
            title = definitions.get((row['Namespace'],row['Key']))
            if title and row['Progression'] >= 100: completed.append(title)
        if len(completed) > 200: raise ValueError('Personal completion limit exceeded')
        items.append(dict(id=profile['id'],name=profile['name'],achievementsKnown=True,achievements=completed))
    return dict(generatedAt=captured,scope='registered_renderer_projection',requestedPlayerIds=[p['id'] for p in profiles],items=items), dict(catalogue,generatedAt=captured)

def export(manifest_path, profiles_path):
    manifest_path = pathlib.Path(manifest_path).resolve(); root = manifest_path.parent
    manifest = json.loads(manifest_path.read_text(encoding='utf-8-sig'))
    captured = manifest['capturedAt']; stamp(captured)
    if manifest.get('consistency') not in ('sqlite-backup','offline-files'): raise ValueError('Declare a consistent SQLite backup or stopped-server files')
    paths = {}
    for relative, expected in manifest['files'].items():
        path = (root / relative).resolve()
        if not path.is_relative_to(root) or not path.is_file() or path.is_symlink(): raise ValueError('Backup input escapes its directory or is missing')
        if digest(path) != expected.lower(): raise ValueError('Backup checksum mismatch')
        paths[relative] = path
    for path in paths.values():
        if path.suffix == '.db':
            journal=path.with_name(path.name+'-journal')
            if journal.exists() and journal.stat().st_size: raise ValueError('Rollback journal present; obtain a clean consistent backup')
            wal = path.with_name(path.name+'-wal')
            if wal.exists() and wal.stat().st_size:
                if manifest['consistency']=='sqlite-backup' or wal not in paths.values(): raise ValueError('Unverified WAL sidecar')
    source = json.loads(pathlib.Path(profiles_path).read_text(encoding='utf-8-sig'))['items']
    if len(source) > 1000: raise ValueError('Profile limit exceeded')
    profiles = [dict(id=identity(row['id']),name=row['name']) for row in source]
    if len(set(row['id'] for row in profiles)) != len(profiles): raise ValueError('Duplicate public identity')
    bundle = {}
    guild_path = paths.get('plugins/LumaGuilds/lumaguilds.db')
    if guild_path:
        progression = yaml.safe_load(paths['plugins/LumaGuilds/progression.yml'].read_text(encoding='utf-8-sig'))
        with database(guild_path) as db: bundle.update(guild_export(db,profiles,captured,progression))
    advancement_path = paths.get('plugins/UltimateAdvancementAPI/database.db')
    if advancement_path:
        if manifest.get('catalogueMatchesBackup') is not True: raise ValueError('Catalogue compatibility must be confirmed')
        config = yaml.safe_load(paths['plugins/UltimateAdvancementAPI/config.yml'].read_text(encoding='utf-8-sig'))
        if str(config.get('storage-type')).lower() != 'sqlite': raise ValueError('Unsupported advancement storage')
        catalogue = json.loads(paths['registered-achievement-catalogue.json'].read_text(encoding='utf-8-sig'))
        with database(advancement_path) as db: bundle['players'],bundle['achievements'] = achievement_export(db,profiles,catalogue,captured)
    if not bundle: raise ValueError('No supported backup data provided')
    for relative, path in paths.items():
        if digest(path) != manifest['files'][relative].lower(): raise ValueError('Backup changed during export')
    return bundle

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest',required=True); parser.add_argument('--profiles',required=True); parser.add_argument('--output',required=True)
    args = parser.parse_args()
    result = export(args.manifest,args.profiles)
    output = pathlib.Path(args.output).resolve(); output.parent.mkdir(parents=True,exist_ok=True)
    manifest_path=pathlib.Path(args.manifest).resolve()
    protected={manifest_path,pathlib.Path(args.profiles).resolve()}
    protected.update((manifest_path.parent / key).resolve() for key in json.loads(manifest_path.read_text(encoding='utf-8-sig'))['files'])
    if output in protected: raise ValueError('Output must not overwrite backup inputs')
    with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=output.parent,delete=False) as tmp:
        json.dump(result,tmp,indent=2); temp_path=pathlib.Path(tmp.name)
    temp_path.replace(output)
    print('Local public bundle exported; input checksums unchanged. Sections: '+', '.join(result))
