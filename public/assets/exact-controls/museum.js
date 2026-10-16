/* Read-only controls ported from the authoritative design. Data model provided by the public API adapter. */
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

class Component extends window.DesignController {
  renderVals() {
    var self = this;
    var st = Object.assign({ menu: '' }, this.state || {});
    var on = function (c) { return c ? 'true' : 'false'; };
    var show = function (c) { return c ? '' : 'hide'; };
    var v = {};
    var i;
    navigationValues(self,st,v);




    var M = window.EnthusiaDesignModel;
    var filter = st.filter || 'all';
    var sel = st.sel === undefined ? 0 : st.sel;
    var shown = 0;
    for (i = 0; i < M.length; i++) {
      (function (n) {
        var match = filter === 'all' || M[n][0] === filter;
        if (match) { shown++; }
        v['m' + n] = show(match);
        v['ms' + n] = on(sel === n);
        v['mk' + n] = function () { self.setState({ sel: n }); };
      })(i);
    }
    v.countLine = shown + ' of ' + M.length + ' pieces shown.';
    v.dNo = 'EXHIBIT ' + (sel < 9 ? '0' : '') + (sel + 1);
    v.dMap = document.documentElement.hasAttribute('data-preview-root')?'mp'+sel:'';
    window.EnthusiaMuseumSelection?.(sel);
    v.dSize = M[sel][2];
    v.dWing = M[sel][1];
    v.dWhere = M[sel][3];
    var names = { All: 'all', Comp: 'comp', Community: 'community', Staff: 'staff' };
    Object.keys(names).forEach(function (name) {
      v['f' + name] = on(filter === names[name]);
      v['pick' + name] = function () { self.setState({ filter: names[name] }); };
    });
    return v;
  }
}
window.EnthusiaDesign.mount(Component, {});
