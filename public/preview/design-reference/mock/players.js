/* Preview only: logic of the "Players" mockup, run by preview/mock.js. */
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
    var P = ["fainneito", "stepsoy", "lavkun"];
    var sel = st.sel === undefined ? 0 : st.sel;
    for (i = 0; i < P.length; i++) {
      (function (n) {
        v['pp' + n] = show(sel === n);
        v['ps' + n] = on(sel === n);
        v['pk' + n] = function () { self.setState({ sel: n, miss: false }); };
      })(i);
    }
    v.q = st.q || '';
    v.setQ = function (e) { self.setState({ q: e.target.value }); };
    v.missShow = show(!!st.miss);
    v.find = function () {
      var t = (st.q || '').toLowerCase().replace(/^\s+|\s+$/g, '');
      for (var n = 0; n < P.length; n++) {
        if (t !== '' && P[n].indexOf(t) === 0) { self.setState({ sel: n, miss: false }); return; }
      }
      self.setState({ miss: t !== '' });
    };
    return v;
  }
}
EnthusiaMock.mount(Component, {});
