/* Preview only: logic of the "Store" mockup, run by preview/mock.js. */
class Component extends DCLogic {
  renderVals() {
    var self = this;
    var st = Object.assign({ menu: '', name: '', who: '', avid: false, dev: false }, this.state || {});
    var on = function (c) { return c ? 'true' : 'false'; };
    var show = function (c) { return c ? '' : 'hide'; };
    var v = {};
    var i;
    var menus = ['Play', 'World', 'Comm', 'News'];
    v.mobOpen = on(!!st.mob);
    v.mobCls = st.mob ? 'open' : '';
    v.togMob = function () { self.setState({ mob: !st.mob }); };
    for (i = 0; i < menus.length; i++) {
      (function (name) {
        v['m' + name + 'Open'] = on(st.menu === name);
        v['m' + name + 'Show'] = show(st.menu === name);
        v['tog' + name] = function () { self.setState({ menu: st.menu === name ? '' : name }); };
      })(menus[i]);
    }
    var clean = String(st.name || '').replace(/\s+/g, '');
    v.name = st.name;
    v.setName = function (e) { self.setState({ name: e.target.value.replace(/\s+/g, '') }); };
    v.confirm = function () { if (clean) { self.setState({ who: clean }); } };
    v.logout = function () { self.setState({ who: '' }); };
    v.who = st.who;
    v.initial = st.who ? st.who.charAt(0).toUpperCase() : '?';
    v.loginShow = show(!st.who);
    v.signedShow = show(!!st.who);
    v.chatName = st.who || clean || 'YourName';
    v.togAvid = function () { self.setState({ avid: !st.avid }); };
    v.togDev = function () { self.setState({ dev: !st.dev }); };
    v.avidIn = show(st.avid);
    v.avidOut = show(!st.avid);
    v.devIn = show(st.dev);
    v.devOut = show(!st.dev);
    v.lineAvid = show(st.avid);
    v.lineDev = show(st.dev);
    v.emptyShow = show(!st.avid && !st.dev);
    var sum = (st.avid ? 5 : 0) + (st.dev ? 10 : 0);
    v.total = '$' + sum.toFixed(2) + ' USD';
    v.hint = !st.who ? 'Enter your username first.' : (sum === 0 ? 'Add a rank to continue.' : 'Ready - checkout opens on Tebex.');
    return v;
  }
}
EnthusiaMock.mount(Component, {});
