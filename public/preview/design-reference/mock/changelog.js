/* Preview only: logic of the "Changelog" mockup, run by preview/mock.js. */
function navigationValues(self,st,v) {
  const on=c=>c?"true":"false",show=c=>c?"":"hide";
  let i;
var menus = ['Play', 'World', 'Comm', 'News'];
for (i = 0; i < menus.length; i++) {
      (function (name) {
        v['m' + name + 'Open'] = on(st.menu === name);
        v['m' + name + 'Show'] = show(st.menu === name);
        v['tog' + name] = function () { self.setState({ menu: st.menu === name ? '' : name }); };
      })(menus[i]);
    }
v.mobOpen = on(!!st.mob);
v.mobCls = st.mob ? 'open' : '';
v.togMob = function () { self.setState({ mob: !st.mob }); };
}

function changelogMatch(row,year,area,q) {return (year==='all'||row[0]===year)&&(area==='all'||row[1].indexOf(area)!==-1)&&(q===''||row[2].indexOf(q)!==-1);}

class Component extends DCLogic {
  renderVals() {
    var self = this;
    var st = Object.assign({ menu: '' }, this.state || {});
    var on = function (c) { return c ? 'true' : 'false'; };
    var show = function (c) { return c ? '' : 'hide'; };
    var v = {};
    var i;
    navigationValues(self,st,v);
    var L = [["2026", ["world", "guilds", "economy", "combat"], "chapter 2 the server moves to minecraft 26.2, and the overworld border grows by 5,000 blocks halloween spawn and warzone guild update: prestige, seasonal elo, more level rewards and refreshed menus enthusiaexpress: letters and packages for offline players, paid in raw gold new advancements across duels, reputation, mail and diaries, claimed with /rewards warzone combat: a boss bar for your combat timer, and restrictions that stay if you leave mid-fight donor perks: donor profiles, gift announcements, mapart shields for devotee and item signatures for avid"], ["2026", ["combat"], "warzone rotators the warzone kit now rotates every week voted in by the community in may"], ["2026", ["world", "economy"], "august update java 25 a network tab list /daily rewards 100 achievements"], ["2026", ["site"], "website overhaul a new look for the website an interactive market page showing every stall, its owner and its stock"], ["2026", ["combat"], "emergency maintenance fixed a homes exploit fixed a duel-spectating exploit"], ["2026", ["economy"], "market relaunch the market reopens with a stall auction a re-bid on 10 july after server trouble"], ["2026", ["economy"], "the market the market releases, then pauses within hours over auction problems every bid refunded"], ["2026", ["combat"], "autoclicker mod an official enthusia autoclicker mod by p2wn is published on modrinth a rework of guild progression is announced"], ["2026", ["world"], "26.2 clients players on minecraft 26.2 can join"], ["2026", ["combat"], "piecloak common base blocks and entities are hidden at a distance, so pie-chart base hunting is less reliable"], ["2026", ["combat"], "death duels 1v1 duels to the death in the spawn arena custom rules and wagers a loot vault for the winner"], ["2026", ["world"], "nether roof players can build and travel on the nether roof"], ["2026", ["world", "economy", "guilds", "combat"], "full release a 100k overworld border the raw gold economy guilds, reputation and bounties proximity voice chat"], ["2026", ["world"], "host upgrade the server moves to a host that can carry a 100k world border"], ["2026", ["world", "guilds"], "1.21.11 the beta updates to 1.21.11, with spears guild history lookups a first survival games playtest"], ["2026", ["site"], "wiki and a new address the enthusia wiki opens to community editing enthusia.net becomes the main address"], ["2026", ["economy"], "bank and reputation raw gold can be banked with /deposit and taken out with /withdrawl /baltop becomes a menu with player heads gold in shulker boxes counts towards your balance homes, beds and teleports rebuilt in-house commendations get their first effects"], ["2026", ["world", "economy", "guilds"], "the prologue borders grow to 20k in the overworld, 10k in the nether and 25k in the end balances and bounties reset after a major dupe guild stalls open for testing minecraft to discord linking with /link"], ["2025", ["economy", "world"], "final open beta commendations, the reputation system a rebuilt playtime system a 44-stall market"], ["2025", ["site"], "store the store opens with avid and devotee, and no pay-to-win perks the founder's badge for early supporters"], ["2025", ["combat", "guilds"], "guild koth and combat logging guilds can enter koth as teams logging out in combat leaves an npc behind new players get 30 minutes of protection"], ["2025", ["economy"], "raw gold the currency changes from diamonds to raw gold first pvp arena test"], ["2025", ["world", "guilds", "economy"], "first open beta the diary, given to every player on first join market stalls, bounties and koth at haunted hill guilds open to all players"]];
    var year = st.year || 'all';
    var area = st.area || 'all';
    var q = (st.q || '').toLowerCase().replace(/^\s+|\s+$/g, '');
    var shown = 0;
    for (i = 0; i < L.length; i++) {
      var match = changelogMatch(L[i],year,area,q);
      if (match) { shown++; }
      v['l' + i] = show(match);
    }
    v.q = st.q || '';
    v.setQ = function (e) { self.setState({ q: e.target.value }); };
    v.countLine = shown + ' of ' + L.length + ' updates shown.';
    v.emptyShow = show(shown === 0);
    ['all', '2026', '2025'].forEach(function (k) {
      v['y_' + k] = on(year === k);
      v['py_' + k] = function () { self.setState({ year: k }); };
    });
    ["all", "world", "economy", "guilds", "combat", "site"].forEach(function (k) {
      v['a_' + k] = on(area === k);
      v['pa_' + k] = function () { self.setState({ area: k }); };
    });
    return v;
  }
}
EnthusiaMock.mount(Component, {});
