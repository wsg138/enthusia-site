import base64, datetime as dt, hashlib, importlib.util, json, pathlib, sqlite3, tempfile, unittest, subprocess
ROOT=pathlib.Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('backup_export',ROOT/'scripts/export-profile-backups.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
P1='10000000-0000-4000-8000-000000000001';P2='10000000-0000-4000-8000-000000000002';P3='10000000-0000-4000-8000-000000000003'
G1='20000000-0000-4000-8000-000000000001';G2='20000000-0000-4000-8000-000000000002'
CAPTURE='2020-01-09T12:00:00Z'
class ExportTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name)
        self.guild=self.root/'plugins/LumaGuilds/lumaguilds.db';self.guild.parent.mkdir(parents=True)
        self.profiles=self.root/'public-profiles.json';self.profiles.write_text(json.dumps({'generatedAt':CAPTURE,'items':[{'id':P1,'name':'Player'},{'id':P2,'name':'Shared'}]}),encoding='utf-8')
        self.progression=self.guild.parent/'progression.yml';self.progression.write_text('quests:\n  full_set_bonus_xp: 5000\n  leaderboard_winner_xp: 1500\n',encoding='utf-8')
        with module.contextlib.closing(sqlite3.connect(self.guild)) as db:
            db.executescript('''CREATE TABLE guilds(id TEXT PRIMARY KEY,name TEXT,level INTEGER,home_world TEXT);
              CREATE TABLE members(player_id TEXT,guild_id TEXT,rank_id TEXT);
              CREATE TABLE guild_banners(guild_id TEXT,base_color TEXT,patterns TEXT,is_active INTEGER,submitted_by TEXT);
              CREATE TABLE weekly_quest_sets(week_id TEXT,starts_at INTEGER,ends_at INTEGER,active INTEGER);
              CREATE TABLE weekly_quest_definitions(week_id TEXT,quest_id TEXT,quest_order INTEGER,action TEXT,target_id TEXT,target_count INTEGER,tier TEXT,conditions TEXT,condition_type TEXT,condition_value TEXT,item_rewards TEXT,leaderboard_payouts TEXT,experience_reward INTEGER,provenance_policy TEXT,leaderboard INTEGER);
              CREATE TABLE guild_quest_progress(week_id TEXT,quest_id TEXT,guild_id TEXT,current_count INTEGER,claimed INTEGER,reward_delivered INTEGER,claim_actor_id TEXT);''')
            db.executemany('INSERT INTO guilds VALUES(?,?,?,?)',[(G1,'Guild',40,'private home'),(G2,'Second',20,'private home')])
            db.execute('INSERT INTO members VALUES(?,?,?)',(P1,G1,'private rank'))
            db.execute('INSERT INTO guild_banners VALUES(?,?,?,?,?)',(G1,'BLUE','BORDER:WHITE',1,'private actor'))
            start=int(dt.datetime(2020,1,6,tzinfo=dt.timezone.utc).timestamp()*1000)
            db.execute('INSERT INTO weekly_quest_sets VALUES(?,?,?,1)',('week',start,start+7*86400000))
            encoded=base64.urlsafe_b64encode(b'diamond_pickaxe').decode().rstrip('=')
            db.execute('INSERT INTO weekly_quest_definitions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',('week','mine',0,'MINE_BLOCKS','minecraft:block/stone',9007199254740993,'COMMON','WITH_TOOL:'+encoded,None,None,'','',500,'NATURAL_ONLY',1))
            for guild in (G2,G1): db.execute('INSERT INTO guild_quest_progress VALUES(?,?,?,?,?,?,?)',('week','mine',guild,9007199254740993,1,1,'private actor'))
            db.commit()
        self.files=['plugins/LumaGuilds/lumaguilds.db','plugins/LumaGuilds/progression.yml']
    def tearDown(self):self.tmp.cleanup()
    def manifest(self,**kwargs):
        manifest={'capturedAt':CAPTURE,'consistency':'sqlite-backup','files':{name:module.digest(self.root/name) for name in self.files},**kwargs}
        path=self.root/'backup-manifest.json';path.write_text(json.dumps(manifest),encoding='utf-8');return path
    def test_public_guilds_banners_counts_ties_and_privacy(self):
        result=module.export(self.manifest(),self.profiles)
        self.assertEqual(result['playerGuilds']['items'][0]['guildMemberships'][0]['banner']['patterns'][0]['type'],'BORDER')
        self.assertEqual(result['playerGuilds']['items'][1]['guildMemberships'],[])
        quest=result['guildquests']['items'][0]['quests'][0]
        self.assertEqual(quest['targetCount'],'9007199254740993');self.assertEqual(quest['standings'][0]['guildId'],G1)
        self.assertEqual(quest['conditions'],['using Diamond Pickaxe']);self.assertNotIn('private',json.dumps(result))
        self.assertEqual(quest['payouts'],[{'rank':1,'experience':1500}])
    def test_bad_hash_and_traversal_rejected(self):
        manifest=self.manifest();self.progression.write_text('changed',encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'checksum'):module.export(manifest,self.profiles)
        data=json.loads(self.manifest().read_text());data['files']['../outside.db']='0'*64;manifest.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError,'escapes'):module.export(manifest,self.profiles)
    def test_shared_uaa_teams_and_removed_nodes_never_become_personal_completions(self):
        path=self.root/'plugins/UltimateAdvancementAPI/database.db';path.parent.mkdir(parents=True)
        with module.contextlib.closing(sqlite3.connect(path)) as db:
            db.executescript('CREATE TABLE Players(UUID TEXT,Name TEXT,TeamID INTEGER);CREATE TABLE Advancements(Namespace TEXT,Key TEXT,TeamID INTEGER,Progression INTEGER);')
            db.executemany('INSERT INTO Players VALUES(?,?,?)',[(P1,'ignored name',1),(P2,'Shared',2),(P3,'private other player',2)])
            db.executemany('INSERT INTO Advancements VALUES(?,?,?,?)',[('provider','guilds/level_40',1,100),('provider','removed',1,100),('provider','guilds/level_40',2,100)])
            db.commit()
        config=path.parent/'config.yml';config.write_text('storage-type: SQLite\n',encoding='utf-8')
        catalogue=self.root/'registered-achievement-catalogue.json';title='A registered achievement title longer than forty letters'
        catalogue.write_text(json.dumps({'scope':'registered_renderer_projection','items':[{'id':'provider:guilds/level_40','name':title,'maximumProgress':100}]}),encoding='utf-8')
        self.files+=['plugins/UltimateAdvancementAPI/database.db','plugins/UltimateAdvancementAPI/config.yml','registered-achievement-catalogue.json']
        result=module.export(self.manifest(catalogueMatchesBackup=True),self.profiles)
        self.assertEqual(result['players']['items'],[{'id':P1,'name':'Player','achievementsKnown':True,'achievements':[title]}])
        self.assertEqual(result['players']['requestedPlayerIds'],[P1,P2]);self.assertNotIn('private',json.dumps(result))
    def test_matching_wal_recovered_only_on_temporary_copy(self):
        db=sqlite3.connect(self.guild);db.execute('PRAGMA journal_mode=WAL');db.execute('PRAGMA wal_autocheckpoint=0')
        db.execute('UPDATE guilds SET level=41 WHERE id=?',(G1,));db.commit()
        self.files.append('plugins/LumaGuilds/lumaguilds.db-wal')
        try:
            manifest=self.manifest(consistency='offline-files')
            result=module.export(manifest,self.profiles)
            self.assertEqual(result['guilds']['items'][0]['level'],41)
            self.assertEqual(module.digest(self.guild),json.loads(manifest.read_text())['files']['plugins/LumaGuilds/lumaguilds.db'])
        finally:db.close()
    def test_unverified_wal_and_hot_journal_rejected(self):
        sidecar=self.guild.with_name(self.guild.name+'-wal');sidecar.write_bytes(b'not a verified snapshot')
        with self.assertRaisesRegex(ValueError,'WAL'):module.export(self.manifest(),self.profiles)
        sidecar.unlink();self.guild.with_name(self.guild.name+'-journal').write_bytes(b'pending rollback')
        with self.assertRaisesRegex(ValueError,'Rollback'):module.export(self.manifest(),self.profiles)
    def test_full_bundle_matches_website_contract(self):
        bundle=self.root/'export.json';output=self.root/'imported.json'
        bundle.write_text(json.dumps(module.export(self.manifest(),self.profiles)),encoding='utf-8')
        result=subprocess.run(['node',str(ROOT/'scripts/import-profile-capture.mjs'),str(self.profiles),str(bundle),str(output)],cwd=ROOT,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        data=json.loads(output.read_text(encoding='utf-8'))
        self.assertEqual(data['feeds']['guildquests']['items'][0]['quests'][0]['targetCount'],'9007199254740993')
        self.assertEqual(data['players']['items'][1]['guildMemberships'],[])
if __name__=='__main__':unittest.main()
