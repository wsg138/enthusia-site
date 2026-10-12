/* Preview only: logic of the "Creators" mockup, run by preview/mock.js. */
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
    var V = ["m0", "m2", "m4", "m1", "other", "m0", "other", "m3", "other", "m2", "m0", "m0", "m2", "other", "m0", "m3", "m4", "m1", "m1", "m1", "m1", "m1", "other"];
    var who = st.who || 'all';
    var all = !!st.all;
    var shown = 0, matched = 0;
    for (i = 0; i < V.length; i++) {
      var match = who === 'all' || V[i] === who;
      if (match) { matched++; }
      var vis = match && (all || who !== 'all' || matched <= 8);
      if (vis) { shown++; }
      v['vd' + i] = show(vis);
    }
    v.total = String(V.length);
    v.countLine = shown + ' of ' + V.length + ' videos shown.';
    v.moreShow = show(who === 'all' && !all);
    v.showAll = function () { self.setState({ all: true }); };
    ["all", "m0", "m1", "m2", "m3", "m4", "other"].forEach(function (k) {
      v['c_' + k] = on(who === k);
      v['pc_' + k] = function () { self.setState({ who: k }); };
    });
    return v;
  }
}
EnthusiaMock.mount(Component, {});
