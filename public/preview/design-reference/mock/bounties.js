/* Preview only: logic of the "Bounties" mockup, run by preview/mock.js. */
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
    var B = [[2400, "open", 3], [1850, "open", 3], [1200, "open", 2], [900, "open", 3], [640, "open", 2], [320, "open", 2], [1500, "claimed", 2], [750, "claimed", 3]];
    var filter = st.filter || 'open';
    var sort = st.sort || 'high';
    var idx = [];
    for (i = 0; i < B.length; i++) { idx.push(i); }
    idx.sort(function (a, b) {
      if (sort === 'new') { return (B[b][2] - B[a][2]) || (B[b][0] - B[a][0]); }
      return (B[b][0] - B[a][0]) || (a - b);
    });
    var shown = 0;
    for (i = 0; i < idx.length; i++) {
      var bi = idx[i];
      var match = filter === 'all' || B[bi][1] === filter;
      if (match) { shown++; }
      v['b' + bi] = (match ? 'o' + i : 'hide') + (B[bi][1] === 'claimed' ? ' done' : '');
    }
    v.countLine = shown + ' ' + (shown === 1 ? 'bounty' : 'bounties') + ' shown.';
    var names = { Open: 'open', Claimed: 'claimed', All: 'all' };
    Object.keys(names).forEach(function (name) {
      v['f' + name] = on(filter === names[name]);
      v['pick' + name] = function () { self.setState({ filter: names[name] }); };
    });
    v.sHigh = on(sort === 'high');
    v.sNew = on(sort === 'new');
    v.pickHigh = function () { self.setState({ sort: 'high' }); };
    v.pickNew = function () { self.setState({ sort: 'new' }); };
    return v;
  }
}
EnthusiaMock.mount(Component, {});
