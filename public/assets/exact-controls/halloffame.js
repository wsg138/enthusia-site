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
    var filter = st.filter || 'all';
    var eras = window.EnthusiaDesignModel;
    var shown = 0;
    for (i = 0; i < eras.length; i++) {
      var match = filter === 'all' || eras[i] === filter;
      if (match) { shown++; }
      v['t' + i] = show(match);
    }
    v.countLine = shown + ' of ' + eras.length + ' trophies shown.';
    var names = { All: 'all', Ch2: 'ch2', Ch1: 'ch1', Beta: 'beta' };
    Object.keys(names).forEach(function (name) {
      v['f' + name] = on(filter === names[name]);
      v['pick' + name] = function () { self.setState({ filter: names[name] }); };
    });
    return v;
  }
}
window.EnthusiaDesign.mount(Component, {});
