/* Preview only: logic of the "ReviewerAppeals" mockup, run by preview/mock.js. */
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
    v.note = st.note || '';
    v.setNote = function (e) { self.setState({ note: e.target.value, tried: false, saved: false }); };
    var hasNote = (st.note || '').replace(/^\s+|\s+$/g, '').length > 0;
    v.decide = function () { self.setState(hasNote ? { saved: true, tried: false } : { tried: true, saved: false }); };
    v.needNoteShow = show(!!st.tried && !hasNote);
    v.savedShow = show(!!st.saved);
    return v;
  }
}
EnthusiaMock.mount(Component, {});
