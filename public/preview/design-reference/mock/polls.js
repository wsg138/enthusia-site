/* Preview only: logic of the "Polls" mockup, run by preview/mock.js. */
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
    var open = (this.props.openPoll ?? 'yes') !== 'no';
    v.openShow = show(open);
    v.closedShow = show(!open);
    var pick = st.pick === undefined ? -1 : st.pick;
    for (i = 0; i < 3; i++) {
      (function (n) {
        v['v' + n] = on(pick === n);
        v['m' + n] = pick === n ? 'Your vote' : '';
        v['vote' + n] = function () { self.setState({ pick: n }); };
      })(i);
    }
    v.voteLine = pick === -1 ? 'Pick an option. You can change it until the poll closes.' : 'Vote saved. Results are shown when the poll closes.';
    return v;
  }
}
EnthusiaMock.mount(Component, {"openPoll": {"editor": "enum", "options": ["yes", "no"], "default": "yes"}});
