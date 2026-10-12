/* Preview only: logic of the "Guilds" mockup, run by preview/mock.js. */
class Component extends DCLogic {
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
    var G = [["Vibe", 100, 1420, 22, 0, "h"], ["BelovedOnes", 96, 1310, 14, 0, "p"], ["WOT", 81, 1265, 19, 1, "h"], ["BoopGang", 74, 1350, 11, 0, "h"], ["Dogeclan", 66, 1205, 9, 1, "h"], ["Asgard", 62, 1290, 12, 1, "h"], ["Enthusiast", 58, 1180, 16, 1, "h"], ["PTC", 47, 1150, 8, 0, "h"], ["Everlights", 44, 1040, 10, 0, "p"], ["Chillage", 31, 1005, 13, 1, "p"], ["Hoplience", 22, 985, 7, 1, "p"], ["Kirky", 18, 970, 5, 0, "p"]];
    var sort = st.sort || 'lvl';
    var filt = st.filt || 'all';
    var q = (st.q || '').toLowerCase().replace(/^\s+|\s+$/g, '');
    var sel = st.sel === undefined ? 0 : st.sel;
    var idx = [];
    for (i = 0; i < G.length; i++) { idx.push(i); }
    idx.sort(function (a, b) {
      if (sort === 'name') { return G[a][0].toLowerCase() < G[b][0].toLowerCase() ? -1 : 1; }
      var k = sort === 'elo' ? 2 : (sort === 'mem' ? 3 : 1);
      return (G[b][k] - G[a][k]) || (a - b);
    });
    var shown = 0;
    var place = {};
    for (i = 0; i < idx.length; i++) {
      var gi = idx[i];
      var match = (filt === 'all' || (filt === 'rec' && G[gi][4] === 1) || (filt === 'hos' && G[gi][5] === 'h') || (filt === 'pea' && G[gi][5] === 'p'))
        && (q === '' || G[gi][0].toLowerCase().indexOf(q) !== -1);
      if (match) { shown++; }
      place[gi] = match ? shown : 0;
      v['r' + gi] = match ? 'o' + i : 'hide';
      v['rk' + gi] = match ? String(shown) : '';
    }
    for (i = 0; i < G.length; i++) {
      (function (n) {
        v['sel' + n] = on(sel === n);
        v['pf' + n] = show(sel === n);
        v['pick' + n] = function () { self.setState({ sel: n }); };
      })(i);
    }
    v.q = st.q || '';
    v.setQ = function (e) { self.setState({ q: e.target.value }); };
    v.countLine = shown + ' of ' + G.length + ' guilds shown.';
    v.emptyShow = show(shown === 0);
    var filters = { All: 'all', Rec: 'rec', Hos: 'hos', Pea: 'pea' };
    Object.keys(filters).forEach(function (name) {
      v['f' + name] = on(filt === filters[name]);
      v['pickF' + name] = function () { self.setState({ filt: filters[name] }); };
    });
    var sorts = { Lvl: 'lvl', Elo: 'elo', Mem: 'mem', Name: 'name' };
    Object.keys(sorts).forEach(function (name) {
      v['s' + name] = on(sort === sorts[name]);
      v['pickS' + name] = function () { self.setState({ sort: sorts[name] }); };
    });
    return v;
  }
}
EnthusiaMock.mount(Component, {});
