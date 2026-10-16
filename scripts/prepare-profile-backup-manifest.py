"""Hash local backup files. Declares supplied backup provenance; does not create/certify a backup."""
import argparse, datetime as dt, hashlib, json, pathlib
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--backup-root',required=True);parser.add_argument('--captured-at',required=True)
parser.add_argument('--consistency',choices=['sqlite-backup','offline-files'],required=True)
parser.add_argument('--catalogue-matches-backup',action='store_true')
parser.add_argument('--extra-file',action='append',default=[])
args=parser.parse_args();root=pathlib.Path(args.backup_root).resolve()
date=dt.datetime.fromisoformat(args.captured_at.replace('Z','+00:00'))
if date.tzinfo is None:raise ValueError('Capture date requires a timezone')
names=['plugins/LumaGuilds/lumaguilds.db','plugins/LumaGuilds/lumaguilds.db-wal','plugins/LumaGuilds/config.yml',
    'plugins/LumaGuilds/progression.yml','plugins/UltimateAdvancementAPI/database.db',
    'plugins/UltimateAdvancementAPI/database.db-wal','plugins/UltimateAdvancementAPI/config.yml',
    'registered-achievement-catalogue.json']
files={}
for relative in names+args.extra_file:
    path=(root/relative).resolve()
    if not path.is_relative_to(root):raise ValueError('Backup path escapes its directory')
    if path.is_file():
        with path.open('rb') as stream:files[relative]=hashlib.file_digest(stream,'sha256').hexdigest()
if not files:raise ValueError('No backup files found')
output=root/'backup-manifest.json'
output.write_text(json.dumps(dict(capturedAt=date.isoformat(),consistency=args.consistency,
    catalogueMatchesBackup=args.catalogue_matches_backup,files=files),indent=2)+'\n',encoding='utf-8')
print('Created local manifest for '+str(len(files))+' files. Original consistency must be established by the backup operator.')
