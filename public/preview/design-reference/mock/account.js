/* Preview only: logic of the "Account" mockup, run by preview/mock.js. */
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
    var signed = (this.props.signedIn ?? 'yes') !== 'no';
    v.inShow = show(signed);
    v.outShow = show(!signed);
    v.codeShow = show(!!st.code);
    v.genCode = function () { self.setState({ code: true }); };
    v.boundShow = show(!!st.bound);
    v.noBindShow = show(!st.bound);
    v.bind = function () { self.setState({ bound: true }); };
    return v;
  }
}
EnthusiaMock.mount(Component, {"signedIn": {"editor": "enum", "options": ["yes", "no"], "default": "yes"}});
