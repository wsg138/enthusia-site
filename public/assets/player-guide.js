/* Player guide search, categories and checklist. */
class Component extends window.DesignController {
  renderVals() {
    var self = this;
    var st = Object.assign({ menu: '' }, this.state || {});
    var on = function (c) { return c ? 'true' : 'false'; };
    var show = function (c) { return c ? '' : 'hide'; };
    var v = {};
    var i;
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
    var NS = 7;
    var done = st.done || {};
    var count = 0;
    for (i = 0; i < NS; i++) {
      (function (n) {
        if (done[n]) { count++; }
        v['ck' + n] = on(!!done[n]);
        v['tk' + n] = function () { var next = Object.assign({}, done); next[n] = !done[n]; self.setState({ done: next }); };
      })(i);
    }
    for (i = 0; i < NS; i++) { v['sg' + i] = i < count ? 'on' : ''; }
    v.doneLine = count === NS ? 'All ' + NS + ' done. You are set.' : count + ' of ' + NS + ' done';
    v.resetSteps = function () { self.setState({ done: {} }); };
    var C = [["general", "/spawn teleport to spawn "], ["general", "/playtime see your playtime. /playtime top lists the leaders "], ["general", "/firstjoined see when you first joined "], ["general", "/report report a player or a bug "], ["general", "/msg and /r private message a player, and reply "], ["general", "/ignore block messages, mail and teleport requests from a player "], ["general", "/link link your minecraft account to discord "], ["general", "/daily claim your daily reward "], ["general", "/rewards claim rewards for achievements "], ["general", "/rep leave a commendation for another player "], ["general", "/ping and /tps check your connection and the server "], ["homes", "/sethome save a home where you stand "], ["homes", "/home teleport to a home "], ["homes", "/homes see all your homes "], ["homes", "/delhome delete a home "], ["homes", "/bed manage see and delete your saved beds "], ["tp", "/tpa ask to teleport to a player "], ["tp", "/tpahere ask a player to teleport to you "], ["tp", "/tpaccept and /tpdeny answer a teleport request "], ["tp", "/tpignore ignore teleport requests from a player "], ["tp", "/tptoggle turn teleport requests on or off "], ["economy", "/bal see your balance "], ["economy", "/baltop the richest players "], ["economy", "/deposit put raw gold in the bank. /deposit all banks everything "], ["economy", "/withdrawl take raw gold out of the bank "], ["economy", "/pay pay another player "], ["guild", "/g create start a guild "], ["guild", "/g menu open the guild menu "], ["guild", "/g list list every guild "], ["guild", "/g info look up a guild "], ["guild", "/g join accept a guild invite "], ["guild", "/g invite invite a player "], ["guild", "/g home teleport to a guild home "], ["guild", "/g vault open the guild vault "], ["guild", "/g ranks manage guild ranks "], ["guild", "/g war declare war on another guild "], ["guild", "/g leave leave your guild "], ["guild", "/pc party chat "], ["fight", "/bounty set a bounty on a player "], ["fight", "/bounty list see every open bounty "], ["fight", "/duel watch watch a death duel "], ["mail", "/mail open your mailbox "], ["mail", "/mail send send a letter or a package "], ["mail", "/mail inbox read what you have received "], ["shops", "/itemshopstutorial learn how item shops work "], ["shops", "/shop list list your shops "], ["shops", "/shop search search shops "], ["shops", "/shop edit edit a shop "], ["shops", "/shop trust let another player manage your shop "], ["shops", "/shopvault open your shop vault "], ["ranks", "/seen see when a player was last online avid"], ["ranks", "[item] show the item in your hand in chat avid"], ["ranks", "/sit and /lay sit or lie down avid"], ["ranks", "/sign and /track sign your gear and add stat trackers to it avid"], ["ranks", "/spin spin devotee"], ["ranks", "[inv] and [ender] show your inventory or ender chest in chat devotee"], ["ranks", "/mapshield put your mapart on a shield devotee"], ["ranks", "/events start an event, paid in raw gold. arrives with events devotee"], ["ranks", "/start koth start a koth. arrives with koth devotee"]];
    var cat = st.cat || 'general';
    var q = (st.q || '').toLowerCase().replace(/^\s+|\s+$/g, '');
    var shown = 0;
    for (i = 0; i < C.length; i++) {
      var match = q !== '' ? C[i][1].indexOf(q) !== -1 : (cat === 'all' || C[i][0] === cat);
      if (match) { shown++; }
      v['cm' + i] = show(match);
    }
    v.q = st.q || '';
    v.setQ = function (e) { self.setState({ q: e.target.value }); };
    v.cmdLine = (q !== '' ? shown + ' of ' + C.length + ' commands match your search.' : shown + ' of ' + C.length + ' commands shown.');
    v.cmdEmpty = show(shown === 0);
    ["all", "general", "homes", "tp", "economy", "guild", "fight", "mail", "shops", "ranks"].forEach(function (k) {
      v['c_' + k] = on(q === '' && cat === k);
      v['pc_' + k] = function () { self.setState({ cat: k, q: '' }); };
    });
    return v;
  }
}
window.EnthusiaDesign.mount(Component, {});
