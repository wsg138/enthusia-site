/* Preview only: logic of the "Timeline" mockup, run by preview/mock.js. */
function navigationValues(self,st,v) {
  const on=c=>c?"true":"false",show=c=>c?"":"hide";
  let i;
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
}

function timelineOrderValues(self,st,v,on){
    var newest = st.newest === undefined ? true : !!st.newest;
    v.revCls = newest ? 'rev' : '';
    v.oOld = on(!newest);
    v.oNew = on(newest);
    v.goOld = function () { self.setState({ newest: false }); };
    v.goNew = function () { self.setState({ newest: true }); };
}

class Component extends DCLogic {
  renderVals() {
    var self = this;
    var st = Object.assign({ menu: '' }, this.state || {});
    var on = function (c) { return c ? 'true' : 'false'; };
    var show = function (c) { return c ? '' : 'hide'; };
    var v = {};
    var i;
    navigationValues(self,st,v);
    var entries = [["dev", "milestone"], ["dev", "milestone"], ["dev", "update"], ["dev", "community"], ["dev", "community"], ["dev", "milestone"], ["dev", "update"], ["beta1", "milestone"], ["beta1", "guild"], ["beta1", "guild"], ["beta1", "update"], ["beta1", "update"], ["beta1", "event"], ["beta1", "community"], ["beta1", "milestone"], ["beta1", "community"], ["beta2", "event"], ["beta2", "milestone"], ["beta2", "update"], ["beta2", "milestone"], ["beta2", "guild"], ["beta2", "event"], ["beta2", "milestone"], ["beta2", "milestone"], ["beta2", "update"], ["beta2", "guild"], ["beta2", "guild"], ["beta2", "community"], ["beta2", "update"], ["beta2", "update"], ["beta2", "guild"], ["beta2", "guild"], ["beta2", "milestone"], ["beta2", "update"], ["beta2", "update"], ["beta2", "event"], ["beta2", "guild"], ["beta2", "milestone"], ["ch1", "milestone"], ["ch1", "event"], ["ch1", "event"], ["ch1", "guild"], ["ch1", "update"], ["ch1", "update"], ["ch1", "event"], ["ch1", "update"], ["ch1", "community"], ["ch1", "update"], ["ch1", "update"], ["ch1", "update"], ["ch1", "guild"], ["ch1", "guild"], ["ch1", "guild"], ["ch1", "event"], ["ch1", "update"], ["ch1", "guild"], ["ch1", "update"], ["ch1", "event"], ["ch1", "community"], ["ch1", "milestone"], ["ch1", "event"], ["ch1", "update"], ["ch1", "update"], ["ch1", "guild"], ["ch1", "guild"], ["ch1", "guild"], ["ch1", "event"], ["ch1", "update"], ["ch1", "update"], ["ch1", "guild"], ["ch1", "guild"], ["ch1", "community"], ["ch1", "guild"], ["ch1", "guild"], ["ch1", "milestone"], ["ch2", "milestone"], ["ch2", "event"], ["ch2", "milestone"], ["ch2", "community"]];
    var eras = ["dev", "beta1", "beta2", "ch1", "ch2"];
    var kinds = ["milestone", "event", "update", "guild", "community"];
    var off = st.off || {};
    var closed = st.closed || { dev: true, beta1: true, beta2: true };
    var shown = 0;
    for (i = 0; i < entries.length; i++) {
      var visible = !off[entries[i][1]];
      if (visible) { shown++; }
      v['e' + i] = show(visible);
    }
    v.countLine = 'Showing ' + shown + ' of ' + entries.length + ' entries.';
    kinds.concat(['shots']).forEach(function (kind) {
      v['f_' + kind] = on(!off[kind]);
      v['pick_' + kind] = function () {
        var next = Object.assign({}, off);
        next[kind] = !off[kind];
        self.setState({ off: next });
      };
    });
    v.shotsCls = off.shots ? 'noshots' : '';
    v.allOn = function () { self.setState({ off: {} }); };
    v.allOff = function () {
      var next = { shots: true };
      kinds.forEach(function (kind) { next[kind] = true; });
      self.setState({ off: next });
    };
    eras.forEach(function (era) {
      var isOpen = !closed[era];
      v['open_' + era] = on(isOpen);
      v['list_' + era] = show(isOpen);
      v['lab_' + era] = isOpen ? 'Hide' : 'Show';
      v['tog_' + era] = function () {
        var next = Object.assign({}, closed);
        next[era] = isOpen;
        self.setState({ closed: next });
      };
    });
    timelineOrderValues(self,st,v,on);
    var big = st.big || {};
    for (i = 0; i < 10; i++) {
      (function (n) {
        v['z' + n] = big[n] ? 'big' : '';
        v['zoom' + n] = function () {
          var next = Object.assign({}, big);
          next[n] = !big[n];
          self.setState({ big: next });
        };
      })(i);
    }
    return v;
  }
}
EnthusiaMock.mount(Component, {});
