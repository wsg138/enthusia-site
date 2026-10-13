/* Preview only: logic of the "Punishments" mockup, run by preview/mock.js. */
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

class Component extends DCLogic {
  renderVals() {
    var self = this;
    var st = Object.assign({ menu: '' }, this.state || {});
    var on = function (c) { return c ? 'true' : 'false'; };
    var show = function (c) { return c ? '' : 'hide'; };
    var v = {};
    var i;
    navigationValues(self,st,v);




    var filter = st.filter || 'all';
    var kinds = ["ban", "mute", "warn", "ban"];
    var shown = 0;
    for (i = 0; i < kinds.length; i++) {
      var match = filter === 'all' || kinds[i] === filter;
      if (match) { shown++; }
      v['r' + i] = show(match);
    }
    v.countLine = shown + ' public record' + (shown === 1 ? '' : 's') + ' shown.';
    var names = { All: 'all', Ban: 'ban', Mute: 'mute', Warn: 'warn' };
    Object.keys(names).forEach(function (name) {
      v['f' + name] = on(filter === names[name]);
      v['pick' + name] = function () { self.setState({ filter: names[name] }); };
    });
    return v;
  }
}
EnthusiaMock.mount(Component, {});
