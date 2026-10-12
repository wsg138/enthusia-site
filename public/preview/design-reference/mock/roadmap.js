/* Preview only: logic of the "Roadmap" mockup, run by preview/mock.js. */
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
    var I = [["live", "world"], ["live", "world"], ["live", "guilds"], ["live", "economy"], ["live", "economy"], ["live", "pvp"], ["live", "pvp"], ["next", "building"], ["next", "building"], ["next", "building"], ["later", "pvp"], ["later", "pvp"], ["later", "pvp"], ["later", "world"]];
    var filter = st.filter || 'all';
    var count = { live: 0, next: 0, later: 0 };
    for (i = 0; i < I.length; i++) {
      var match = filter === 'all' || I[i][1] === filter;
      if (match) { count[I[i][0]]++; }
      v['i' + i] = show(match);
    }
    ['live', 'next', 'later'].forEach(function (k) {
      v['n_' + k] = String(count[k]);
      v['e_' + k] = show(count[k] === 0);
    });
    var names = { All: 'all', World: 'world', Guilds: 'guilds', Pvp: 'pvp', Building: 'building', Economy: 'economy' };
    Object.keys(names).forEach(function (name) {
      v['f' + name] = on(filter === names[name]);
      v['pick' + name] = function () { self.setState({ filter: names[name] }); };
    });
    return v;
  }
}
EnthusiaMock.mount(Component, {});
