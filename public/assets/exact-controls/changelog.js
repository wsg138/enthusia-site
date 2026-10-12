/* Read-only controls ported from the authoritative design. Data model provided by the public API adapter. */
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
    var L = window.EnthusiaDesignModel;
    var year = st.year || 'all';
    var area = st.area || 'all';
    var q = (st.q || '').toLowerCase().replace(/^\s+|\s+$/g, '');
    var shown = 0;
    for (i = 0; i < L.length; i++) {
      var match = (year === 'all' || L[i][0] === year) && (area === 'all' || L[i][1].indexOf(area) !== -1) && (q === '' || L[i][2].indexOf(q) !== -1);
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
window.EnthusiaDesign.mount(Component, {});
