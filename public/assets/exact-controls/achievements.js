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
    var set = st.set || 'duels';
    ["duels", "rep", "mail", "diary"].forEach(function (k) {
      v['s_' + k] = show(set === k);
      v['c_' + k] = on(set === k);
      v['pc_' + k] = function () { self.setState({ set: k }); };
    });
    var T = window.EnthusiaDesignModel;
    var tf = st.tf || 'all';
    for (i = 0; i < T.length; i++) { v['t' + i] = show(tf === 'all' || T[i] === tf); }
    ['all', 'earn', 'retired'].forEach(function (k) {
      v['g_' + k] = on(tf === k);
      v['pg_' + k] = function () { self.setState({ tf: k }); };
    });
    return v;
  }
}
window.EnthusiaDesign.mount(Component, {});
