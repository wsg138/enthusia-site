/* Preview only: logic of the "Reviewer" mockup, run by preview/mock.js. */
class Component extends DCLogic {
  renderVals() {
    var self = this;
    var st = Object.assign({ menu: '' }, this.state || {});
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
    var access = this.props.access ?? 'staff';
    v.staffShow = show(access === 'staff');
    v.outShow = show(access === 'signed out');
    v.deniedShow = show(access === 'no access');
    return v;
  }
}
EnthusiaMock.mount(Component, {"access": {"editor": "enum", "options": ["staff", "signed out", "no access"], "default": "staff"}});
