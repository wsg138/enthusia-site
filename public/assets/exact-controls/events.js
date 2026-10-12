/* Preview only: logic of the "Events" mockup, run by preview/mock.js. */
class Component extends window.DesignController {
  componentDidMount() {
    window.setInterval(() => this.__render(), 60000);
  }
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
    var NEXT = window.EnthusiaEventDesignNext;
    var now = Date.now();
    var nx = null;
    for (i = 0; i < NEXT.length; i++) {
      var t = Date.UTC(NEXT[i][0][0], NEXT[i][0][1], NEXT[i][0][2], NEXT[i][0][3], NEXT[i][0][4] || 0, NEXT[i][0][5] || 0);
      if (t > now) { nx = NEXT[i]; nx.left = t - now; break; }
    }
    v.nextTitle = nx ? nx[1] : 'To be announced';
    v.nextText = nx ? nx[2] : 'The next dated event has not been announced yet.';
    v.nextDate = nx ? nx[3] : 'Watch the Discord for the date.';
    v.nextDays = nx ? String(Math.floor(nx.left / 86400000)) : '0';
    v.nextHours = nx ? String(Math.floor((nx.left % 86400000) / 3600000)) : '0';
    var MON = window.EnthusiaEventDesignMonths;
    var today = new Date();
    var startMon=0;
    var mon = st.mon === undefined ? startMon : st.mon;
    for (i = 0; i < MON.length; i++) {
      v['mon' + i] = show(mon === i);
      for (var d = 1; d <= MON[i][2]; d++) {
        v['c' + MON[i][1] + '_' + d] = (today.getFullYear() === 2026 && today.getMonth() === MON[i][1] && today.getDate() === d) ? 'today' : '';
      }
    }
    v.monLabel = MON[mon][0];
    v.monPrev = function () { self.setState({ mon: Math.max(0, mon - 1) }); };
    v.monNext = function () { self.setState({ mon: Math.min(MON.length - 1, mon + 1) }); };
    var filter = st.filter || 'all';
    var kinds = ["build", "build", "pvp", "pvp", "pvp", "pvp", "pvp", "community", "community"];
    for (i = 0; i < kinds.length; i++) { v['k' + i] = show(filter === 'all' || kinds[i] === filter); }
    var names = { All: 'all', Pvp: 'pvp', Build: 'build', Community: 'community' };
    Object.keys(names).forEach(function (name) {
      v['f' + name] = on(filter === names[name]);
      v['pick' + name] = function () { self.setState({ filter: names[name] }); };
    });
    return v;
  }
}
window.EnthusiaDesign.mount(Component, {});
