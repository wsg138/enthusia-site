// This legacy import note is stored in record bodies; remove only the exact trailing note for display.
const IMPORT_NOTE = /(?:\r?\n){1,2}Source verification pending\. Imported from the supplied site content\.$/;

export function timelineDisplayBody(body) {
  return typeof body === 'string' ? body.replace(IMPORT_NOTE, '') : body;
}

const releases = new Map([
  ['chapter-2-launches-20261002', 'Chapter 2'],
  ['warzone-rotators-20260801', 'Warzone Rotators'],
  ['august-update-20260804', 'August update'],
  ['website-overhaul-20260719', 'Website overhaul'],
  ['emergency-maintenance-20260715', 'Emergency maintenance'],
  ['market-auction-20260709', 'Market relaunch'],
  ['market-opens-then-pauses-20260703', 'The Market'],
  ['official-autoclicker-mod-20260628', 'Autoclicker mod'],
  ['26-2-clients-supported-20260627', '26.2 clients'],
  ['piecloak-20260601', 'PieCloak'],
  ['death-duels-20260516', 'Death Duels'],
  ['nether-roof-opens-20260511', 'Nether roof'],
  ['full-release-20260502', 'Full release'],
  ['host-upgrade-20260404', 'Host upgrade'],
  ['1-21-11-update-20260321', '1.21.11'],
  ['wiki-goes-live-20260125', 'Wiki and a new address'],
  ['bank-and-reputation-update-20260123', 'Bank and reputation'],
  ['the-prologue-begins-20260102', 'The Prologue'],
  ['final-open-beta-opens-20251220', 'Final Open Beta'],
  ['store-opens-20251219', 'Store'],
  ['guild-koth-and-combat-logging-20251111', 'Guild KOTH and combat logging'],
  ['raw-gold-replaces-diamonds-20251101', 'Raw Gold'],
  ['first-open-beta-opens-20251031', 'First Open Beta']
]);

export function timelineReleaseTitle(slug) {
  return releases.get(slug);
}
